"use client";

import "leaflet/dist/leaflet.css";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { fetchEnsayosConEntradas } from "@/lib/comparador-db";
import type { EnsayoConEntradas } from "@/lib/comparador-types";

// ── Constants ─────────────────────────────────────────────────────────────────

const COLORS = ["#e2b04a", "#3dbb6e", "#4a9ee2", "#e24a7a"];

const LOGO_MAP: Record<string, string> = {
  CREA: "/comparador/logos/CREA.jpg",
  "Grupo Lajitas": "/comparador/logos/Grupo_Lajitas.png",
};

// ── Compute helpers ───────────────────────────────────────────────────────────

interface HybridStats {
  name: string;
  mean: number;
  n: number;
  byLocalidad: Record<string, number>;
}

function computeHybridStats(name: string, ensayos: EnsayoConEntradas[]): HybridStats {
  const byLoc: Record<string, number[]> = {};
  for (const e of ensayos) {
    const entry = e.entradas.find((x) => x.hibrido === name);
    if (entry) {
      (byLoc[e.localidad] ??= []).push(entry.rendimiento);
    }
  }
  const locs = Object.keys(byLoc);
  const meanPerLoc: Record<string, number> = {};
  for (const loc of locs) {
    const vals = byLoc[loc];
    meanPerLoc[loc] = vals.reduce((a, b) => a + b, 0) / vals.length;
  }
  const mean =
    locs.length > 0
      ? Object.values(meanPerLoc).reduce((a, b) => a + b, 0) / locs.length
      : 0;
  return { name, mean, n: locs.length, byLocalidad: meanPerLoc };
}

function computeIA(ensayos: EnsayoConEntradas[]): Record<string, number> {
  const byLoc: Record<string, number[]> = {};
  for (const e of ensayos) {
    for (const entry of e.entradas) {
      (byLoc[e.localidad] ??= []).push(entry.rendimiento);
    }
  }
  return Object.fromEntries(
    Object.entries(byLoc).map(([loc, vals]) => [
      loc,
      vals.reduce((a, b) => a + b, 0) / vals.length,
    ])
  );
}

function linReg(
  points: [number, number][]
): { slope: number; intercept: number; r2: number } | null {
  const n = points.length;
  if (n < 2) return null;
  const mx = points.reduce((s, p) => s + p[0], 0) / n;
  const my = points.reduce((s, p) => s + p[1], 0) / n;
  const ssxx = points.reduce((s, p) => s + (p[0] - mx) ** 2, 0);
  const ssxy = points.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0);
  if (ssxx === 0) return null;
  const slope = ssxy / ssxx;
  const intercept = my - slope * mx;
  const ssyy = points.reduce((s, p) => s + (p[1] - my) ** 2, 0);
  const r2 = ssyy > 0 ? ssxy ** 2 / (ssxx * ssyy) : 1;
  return { slope, intercept, r2 };
}

// ── SVG Bar Chart ─────────────────────────────────────────────────────────────

function BarChart({ stats }: { stats: HybridStats[] }) {
  if (stats.length === 0) return null;
  const maxMean = Math.max(...stats.map((s) => s.mean));
  const barH = 36;
  const labelW = 170;
  const valueW = 70;
  const padX = 16;
  const barMaxW = 300;
  const rowH = barH + 12;
  const height = 20 + stats.length * rowH + 30;
  const width = labelW + barMaxW + valueW + padX * 2;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{ width: "100%", maxWidth: width, display: "block" }}
    >
      {/* X axis label */}
      <text
        x={labelW + barMaxW / 2}
        y={height - 6}
        textAnchor="middle"
        fontSize={10}
        fill="#4a6a8a"
      >
        Rendimiento medio (kg/ha)
      </text>

      {stats.map((s, i) => {
        const barW = maxMean > 0 ? (s.mean / maxMean) * barMaxW : 0;
        const y = 20 + i * rowH;
        const color = COLORS[i % COLORS.length];
        const shortName = s.name.length > 22 ? s.name.slice(0, 21) + "…" : s.name;
        return (
          <g key={s.name}>
            <text
              x={labelW - 8}
              y={y + barH / 2 + 4}
              textAnchor="end"
              fontSize={11}
              fill="#aac4e0"
            >
              {shortName}
            </text>
            <rect
              x={labelW}
              y={y + 4}
              width={barW}
              height={barH - 8}
              rx={4}
              fill={color}
              fillOpacity={0.85}
            />
            <text
              x={labelW + barW + 6}
              y={y + barH / 2 + 4}
              fontSize={11}
              fill={color}
              fontWeight="600"
            >
              {s.mean > 0 ? Math.round(s.mean).toLocaleString("es-AR") : "—"}
            </text>
            <text x={labelW + barW + 6} y={y + barH / 2 + 17} fontSize={9} fill="#4a6a8a">
              n={s.n}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── SVG Regression Chart ──────────────────────────────────────────────────────

function RegressionChart({
  stats,
  ia,
}: {
  stats: HybridStats[];
  ia: Record<string, number>;
}) {
  const allPoints = stats.flatMap((s) =>
    Object.entries(s.byLocalidad).map(([loc, rend]) => ({
      x: ia[loc] ?? 0,
      y: rend,
    }))
  );
  if (allPoints.length < 2) return null;

  const ml = 60;
  const mr = 20;
  const mt = 16;
  const mb = 50;
  const W = 520;
  const H = 300;
  const pw = W - ml - mr;
  const ph = H - mt - mb;

  const xs = allPoints.map((p) => p.x);
  const ys = allPoints.map((p) => p.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;

  const sx = (v: number) => ml + ((v - xMin) / xRange) * pw;
  const sy = (v: number) => mt + ph - ((v - yMin) / yRange) * ph;

  const xTicks = 5;
  const yTicks = 5;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", maxWidth: W, display: "block" }}
    >
      {/* Grid */}
      {Array.from({ length: yTicks }).map((_, i) => {
        const v = yMin + (i / (yTicks - 1)) * yRange;
        const y = sy(v);
        return (
          <g key={i}>
            <line x1={ml} y1={y} x2={ml + pw} y2={y} stroke="#1a3060" strokeWidth={1} />
            <text x={ml - 6} y={y + 4} fontSize={9} fill="#4a6a8a" textAnchor="end">
              {Math.round(v / 100) * 100}
            </text>
          </g>
        );
      })}
      {Array.from({ length: xTicks }).map((_, i) => {
        const v = xMin + (i / (xTicks - 1)) * xRange;
        const x = sx(v);
        return (
          <text key={i} x={x} y={H - mb + 16} fontSize={9} fill="#4a6a8a" textAnchor="middle">
            {Math.round(v / 100) * 100}
          </text>
        );
      })}

      {/* Axes */}
      <line x1={ml} y1={mt} x2={ml} y2={mt + ph} stroke="#2a4060" strokeWidth={1} />
      <line x1={ml} y1={mt + ph} x2={ml + pw} y2={mt + ph} stroke="#2a4060" strokeWidth={1} />

      {/* Axis labels */}
      <text
        x={ml + pw / 2}
        y={H - 6}
        textAnchor="middle"
        fontSize={10}
        fill="#4a6a8a"
      >
        Índice Ambiental (kg/ha)
      </text>
      <text
        x={12}
        y={mt + ph / 2}
        textAnchor="middle"
        fontSize={10}
        fill="#4a6a8a"
        transform={`rotate(-90, 12, ${mt + ph / 2})`}
      >
        Rendimiento (kg/ha)
      </text>

      {/* Regression lines */}
      {stats.map((s, i) => {
        const points: [number, number][] = Object.entries(s.byLocalidad)
          .filter(([loc]) => ia[loc] !== undefined)
          .map(([loc, rend]) => [ia[loc], rend]);
        const reg = linReg(points);
        if (!reg) return null;
        const x0 = xMin;
        const x1 = xMax;
        return (
          <line
            key={s.name}
            x1={sx(x0)}
            y1={sy(reg.slope * x0 + reg.intercept)}
            x2={sx(x1)}
            y2={sy(reg.slope * x1 + reg.intercept)}
            stroke={COLORS[i % COLORS.length]}
            strokeWidth={1.5}
            strokeOpacity={0.6}
            strokeDasharray="4 2"
          />
        );
      })}

      {/* Scatter points */}
      {stats.map((s, i) =>
        Object.entries(s.byLocalidad)
          .filter(([loc]) => ia[loc] !== undefined)
          .map(([loc, rend]) => (
            <circle
              key={`${s.name}-${loc}`}
              cx={sx(ia[loc])}
              cy={sy(rend)}
              r={5}
              fill={COLORS[i % COLORS.length]}
              fillOpacity={0.8}
              stroke="#1a1a2e"
              strokeWidth={1}
            >
              <title>
                {loc}: {Math.round(rend).toLocaleString("es-AR")} kg/ha (IA:{" "}
                {Math.round(ia[loc]).toLocaleString("es-AR")})
              </title>
            </circle>
          ))
      )}

      {/* Legend */}
      {stats.map((s, i) => (
        <g key={s.name} transform={`translate(${ml + (i * (pw / stats.length))}, ${H - 10})`}>
          <circle cx={6} cy={0} r={4} fill={COLORS[i % COLORS.length]} />
          <text x={14} y={4} fontSize={9} fill="#aac4e0">
            {s.name.length > 18 ? s.name.slice(0, 17) + "…" : s.name}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ── Hybrid Selector ───────────────────────────────────────────────────────────

function HybridSelect({
  label,
  value,
  onChange,
  options,
  color,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  color: string;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSearch(value);
  }, [value]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = options
    .filter((o) => o.toLowerCase().includes(search.toLowerCase()))
    .slice(0, 12);

  function select(o: string) {
    onChange(o);
    setSearch(o);
    setOpen(false);
  }

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <label
        style={{
          display: "block",
          fontSize: 11,
          color,
          fontWeight: 600,
          marginBottom: 4,
        }}
      >
        {label} {required && <span style={{ color: "#e24a7a" }}>*</span>}
      </label>
      <input
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Buscar híbrido…"
        style={{
          width: "100%",
          background: "#0f2040",
          border: `1px solid ${value ? color : "#1a4a80"}`,
          borderRadius: 8,
          padding: "8px 10px",
          color: "#e0e0e0",
          fontSize: 13,
          outline: "none",
          boxSizing: "border-box",
        }}
      />
      {value && (
        <button
          onClick={() => {
            onChange("");
            setSearch("");
          }}
          style={{
            position: "absolute",
            right: 8,
            top: 30,
            background: "none",
            border: "none",
            color: "#4a6a8a",
            cursor: "pointer",
            fontSize: 14,
            padding: "0 4px",
          }}
        >
          ×
        </button>
      )}
      {open && filtered.length > 0 && (
        <ul
          style={{
            position: "absolute",
            zIndex: 100,
            top: "100%",
            left: 0,
            right: 0,
            background: "#16213e",
            border: "1px solid #0f3460",
            borderRadius: 8,
            margin: "2px 0 0",
            padding: 0,
            listStyle: "none",
            maxHeight: 220,
            overflowY: "auto",
          }}
        >
          {filtered.map((o) => (
            <li
              key={o}
              onMouseDown={() => select(o)}
              style={{
                padding: "8px 12px",
                cursor: "pointer",
                fontSize: 12,
                color: "#aac4e0",
                borderBottom: "1px solid #0f2040",
              }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLElement).style.background = "#1a3060")
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLElement).style.background = "transparent")
              }
            >
              {o}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Map view ──────────────────────────────────────────────────────────────────

interface LocalidadInfo {
  lat: number;
  lng: number;
  institucion: string;
}

function LocalidadMap({
  ensayos,
  selectedLocalidades,
  onToggle,
}: {
  ensayos: EnsayoConEntradas[];
  selectedLocalidades: string[];
  onToggle: (loc: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{ map: unknown; markers: Map<string, unknown> } | null>(null);

  const localidades = useMemo(() => {
    const m = new Map<string, LocalidadInfo>();
    for (const e of ensayos) {
      if (e.lat !== null && e.lng !== null && !m.has(e.localidad)) {
        m.set(e.localidad, { lat: e.lat, lng: e.lng, institucion: e.institucion });
      }
    }
    return m;
  }, [ensayos]);

  const onToggleRef = useRef(onToggle);
  onToggleRef.current = onToggle;

  // Init map once
  useEffect(() => {
    if (!containerRef.current) return;
    let destroyed = false;

    import("leaflet").then((mod) => {
      if (destroyed || !containerRef.current) return;
      const L = mod.default;
      const container = containerRef.current as HTMLElement & { _leaflet_id?: number };
      if (container._leaflet_id) return;

      const map = L.map(container, { center: [-26, -63.5], zoom: 7 });

      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 19, attribution: "" }
      ).addTo(map);

      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
        { maxZoom: 19, opacity: 0.7, attribution: "" }
      ).addTo(map);

      mapRef.current = { map, markers: new Map() };
    });

    return () => {
      destroyed = true;
      if (mapRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (mapRef.current.map as any).remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update markers whenever localidades or selection changes
  useEffect(() => {
    if (!mapRef.current) {
      // Retry after a short delay for map init
      const t = setTimeout(() => {
        if (!mapRef.current) return;
        drawMarkers();
      }, 300);
      return () => clearTimeout(t);
    }
    drawMarkers();

    function drawMarkers() {
      if (!mapRef.current) return;
      import("leaflet").then((mod) => {
        if (!mapRef.current) return;
        const L = mod.default;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const map = mapRef.current.map as any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const markers = mapRef.current.markers as Map<string, any>;

        markers.forEach((m) => m.remove());
        markers.clear();

        localidades.forEach(({ lat, lng, institucion }, loc) => {
          const selected = selectedLocalidades.includes(loc);
          const logoSrc = LOGO_MAP[institucion];
          const border = selected ? "#e2b04a" : "#3dbb6e";
          const initials = institucion
            .split(" ")
            .map((w) => w[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();

          const iconHtml = logoSrc
            ? `<img src="${logoSrc}" style="width:36px;height:36px;border-radius:50%;border:3px solid ${border};object-fit:cover;" />`
            : `<div style="width:36px;height:36px;border-radius:50%;background:#1a4a80;border:3px solid ${border};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#e2b04a;">${initials}</div>`;

          const icon = L.divIcon({
            html: iconHtml,
            className: "",
            iconSize: [42, 42],
            iconAnchor: [21, 21],
          });

          const marker = L.marker([lat, lng], { icon })
            .addTo(map)
            .bindTooltip(`<strong>${loc}</strong><br><span style="color:#6a8ab0;font-size:11px">${institucion}</span>`, {
              direction: "top",
              className: "comparador-tooltip",
            })
            .on("click", () => onToggleRef.current(loc));

          markers.set(loc, marker);
        });
      });
    }
  }, [localidades, selectedLocalidades]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "380px", borderRadius: 12, overflow: "hidden" }}
    />
  );
}

// ── Head-to-head summary ──────────────────────────────────────────────────────

function HeadToHead({ a, b }: { a: HybridStats; b: HybridStats }) {
  const common = Object.keys(a.byLocalidad).filter((loc) => b.byLocalidad[loc] !== undefined);
  if (common.length === 0) {
    return (
      <p style={{ color: "#4a6a8a", fontSize: 13 }}>
        No hay localidades en común entre {a.name} y {b.name}.
      </p>
    );
  }
  const diffs = common.map((loc) => a.byLocalidad[loc] - b.byLocalidad[loc]);
  const meanDiff = diffs.reduce((x, y) => x + y, 0) / diffs.length;
  const aWins = diffs.filter((d) => d > 0).length;
  const winner = meanDiff > 0 ? a : b;
  const loser = meanDiff > 0 ? b : a;

  return (
    <div
      style={{
        background: "#0f2040",
        borderRadius: 10,
        padding: "12px 16px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <p style={{ color: "#e2b04a", fontWeight: 700, fontSize: 13 }}>
        {winner.name}{" "}
        <span style={{ color: "#3dbb6e" }}>
          +{Math.abs(Math.round(meanDiff)).toLocaleString("es-AR")} kg/ha
        </span>{" "}
        <span style={{ color: "#6a8ab0", fontWeight: 400 }}>vs {loser.name}</span>
      </p>
      <p style={{ color: "#4a6a8a", fontSize: 11 }}>
        {common.length} loc. en común · {a.name} gana en {aWins}/{common.length}
      </p>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ComparacionApp() {
  const supabase = createSupabaseBrowserClient();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [cultivo, setCultivo] = useState<"maiz" | "soja" | null>(null);
  const [filterMode, setFilterMode] = useState<"mapa" | "red" | null>(null);
  const [selectedLocalidades, setSelectedLocalidades] = useState<string[]>([]);
  const [selectedRedes, setSelectedRedes] = useState<string[]>([]);
  const [hibridos, setHibridos] = useState(["", "", "", ""]);
  const [ensayos, setEnsayos] = useState<EnsayoConEntradas[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load ensayos when cultivo is chosen
  useEffect(() => {
    if (!cultivo) return;
    setLoading(true);
    setError(null);
    fetchEnsayosConEntradas(supabase, { cultivo })
      .then((data) => {
        setEnsayos(data);
        setLoading(false);
      })
      .catch((e) => {
        setError(String(e));
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cultivo]);

  const redes = useMemo(
    () => [...new Set(ensayos.map((e) => e.red))].sort(),
    [ensayos]
  );

  const ensayosFiltrados = useMemo(() => {
    if (filterMode === "mapa")
      return ensayos.filter((e) => selectedLocalidades.includes(e.localidad));
    if (filterMode === "red")
      return ensayos.filter((e) => selectedRedes.includes(e.red));
    return [];
  }, [ensayos, filterMode, selectedLocalidades, selectedRedes]);

  const hibridosDisponibles = useMemo(() => {
    const set = new Set<string>();
    for (const e of ensayosFiltrados) {
      for (const entry of e.entradas) set.add(entry.hibrido);
    }
    return [...set].sort();
  }, [ensayosFiltrados]);

  const activeHibridos = hibridos.filter(Boolean);
  const stats = useMemo(
    () => activeHibridos.map((h) => computeHybridStats(h, ensayosFiltrados)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(activeHibridos), ensayosFiltrados]
  );
  const ia = useMemo(() => computeIA(ensayosFiltrados), [ensayosFiltrados]);

  const canProceed =
    filterMode === "mapa" ? selectedLocalidades.length > 0 : selectedRedes.length > 0;

  const hasResults = stats.length >= 2 && stats[0].n > 0 && stats[1].n > 0;

  const toggleLocalidad = useCallback((loc: string) => {
    setSelectedLocalidades((prev) =>
      prev.includes(loc) ? prev.filter((l) => l !== loc) : [...prev, loc]
    );
  }, []);

  function goStep1() {
    setStep(1);
    setCultivo(null);
    setFilterMode(null);
    setSelectedLocalidades([]);
    setSelectedRedes([]);
    setHibridos(["", "", "", ""]);
    setEnsayos([]);
  }

  function goStep2() {
    setStep(2);
    setFilterMode(null);
    setSelectedLocalidades([]);
    setSelectedRedes([]);
    setHibridos(["", "", "", ""]);
  }

  // ── Step 1: Cultivo ──────────────────────────────────────────────────────────

  if (step === 1) {
    return (
      <main
        className="flex-1 flex flex-col items-center justify-center px-6"
        style={{ background: "#1a1a2e", minHeight: "100vh" }}
      >
        <div style={{ width: "100%", maxWidth: 480 }}>
          <Link href="/comparador" style={{ color: "#4a6a8a", fontSize: 13, display: "block", marginBottom: 32 }}>
            ← Comparador
          </Link>
          <h1 style={{ color: "#e2b04a", fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
            Genética / ECR
          </h1>
          <p style={{ color: "#6a8ab0", fontSize: 14, marginBottom: 40 }}>
            ¿Con qué cultivo querés trabajar?
          </p>

          <div style={{ display: "flex", gap: 16 }}>
            <button
              onClick={() => {
                setCultivo("maiz");
                setStep(2);
              }}
              style={{
                flex: 1,
                padding: "28px 16px",
                background: "#16213e",
                border: "2px solid #3dbb6e",
                borderRadius: 16,
                color: "#e0e0e0",
                fontSize: 16,
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span style={{ fontSize: 40 }}>🌽</span>
              Maíz
            </button>
            <button
              onClick={() => {
                setCultivo("soja");
                setStep(2);
              }}
              style={{
                flex: 1,
                padding: "28px 16px",
                background: "#16213e",
                border: "2px solid #1a4a80",
                borderRadius: 16,
                color: "#6a8ab0",
                fontSize: 16,
                fontWeight: 700,
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 10,
              }}
            >
              <span style={{ fontSize: 40 }}>🌱</span>
              Soja
              <span
                style={{
                  fontSize: 10,
                  background: "#0f3460",
                  color: "#4a6a8a",
                  borderRadius: 8,
                  padding: "2px 8px",
                }}
              >
                Sin datos aún
              </span>
            </button>
          </div>
        </div>
      </main>
    );
  }

  // ── Step 2: Filter mode ──────────────────────────────────────────────────────

  if (step === 2) {
    return (
      <main style={{ background: "#1a1a2e", minHeight: "100vh", padding: "24px 16px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          {/* Breadcrumb */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
            <button onClick={goStep1} style={{ background: "none", border: "none", color: "#4a6a8a", cursor: "pointer", fontSize: 13 }}>
              ← Cultivo
            </button>
            <span style={{ color: "#2a4060" }}>·</span>
            <span style={{ color: "#e2b04a", fontWeight: 700, fontSize: 13 }}>
              {cultivo === "maiz" ? "🌽 Maíz" : "🌱 Soja"}
            </span>
          </div>

          <h2 style={{ color: "#e0e0e0", fontSize: 20, fontWeight: 700, marginBottom: 6 }}>
            ¿Cómo querés filtrar los ensayos?
          </h2>
          <p style={{ color: "#6a8ab0", fontSize: 13, marginBottom: 24 }}>
            {loading ? "Cargando datos…" : `${ensayos.length} ensayos disponibles`}
          </p>

          {error && (
            <p style={{ color: "#e24a7a", background: "#2a0a1a", borderRadius: 8, padding: 12, marginBottom: 16 }}>
              {error}
            </p>
          )}

          {/* Mode selector */}
          {!filterMode && (
            <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
              <button
                onClick={() => setFilterMode("mapa")}
                disabled={loading}
                style={{
                  flex: 1,
                  padding: "20px 16px",
                  background: "#16213e",
                  border: "2px solid #1a4a80",
                  borderRadius: 16,
                  color: "#aac4e0",
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: loading ? "not-allowed" : "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                  opacity: loading ? 0.5 : 1,
                }}
              >
                <span style={{ fontSize: 32 }}>🗺</span>
                Por mapa
                <span style={{ fontSize: 11, color: "#4a6a8a" }}>
                  Elegí localidades en el mapa
                </span>
              </button>
              <button
                onClick={() => setFilterMode("red")}
                disabled={loading}
                style={{
                  flex: 1,
                  padding: "20px 16px",
                  background: "#16213e",
                  border: "2px solid #1a4a80",
                  borderRadius: 16,
                  color: "#aac4e0",
                  fontSize: 15,
                  fontWeight: 600,
                  cursor: loading ? "not-allowed" : "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 8,
                  opacity: loading ? 0.5 : 1,
                }}
              >
                <span style={{ fontSize: 32 }}>📋</span>
                Por red
                <span style={{ fontSize: 11, color: "#4a6a8a" }}>
                  Filtrá por red de ensayos
                </span>
              </button>
            </div>
          )}

          {/* Mapa mode */}
          {filterMode === "mapa" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <button
                  onClick={() => setFilterMode(null)}
                  style={{ background: "none", border: "none", color: "#4a6a8a", cursor: "pointer", fontSize: 12 }}
                >
                  ← Cambiar modo
                </button>
                <span style={{ color: "#4a6a8a", fontSize: 12 }}>
                  Clickeá localidades para seleccionarlas
                </span>
                {selectedLocalidades.length > 0 && (
                  <span
                    style={{
                      background: "#1a4a80",
                      color: "#e2b04a",
                      borderRadius: 20,
                      padding: "2px 10px",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {selectedLocalidades.length} seleccionada{selectedLocalidades.length > 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <LocalidadMap
                ensayos={ensayos}
                selectedLocalidades={selectedLocalidades}
                onToggle={toggleLocalidad}
              />
              {/* Selected chips */}
              {selectedLocalidades.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                  {selectedLocalidades.map((loc) => (
                    <span
                      key={loc}
                      onClick={() => toggleLocalidad(loc)}
                      style={{
                        background: "#16213e",
                        border: "1px solid #e2b04a",
                        color: "#e2b04a",
                        borderRadius: 20,
                        padding: "3px 10px",
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      {loc} ×
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Red mode */}
          {filterMode === "red" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                <button
                  onClick={() => setFilterMode(null)}
                  style={{ background: "none", border: "none", color: "#4a6a8a", cursor: "pointer", fontSize: 12 }}
                >
                  ← Cambiar modo
                </button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {redes.map((red) => {
                  const checked = selectedRedes.includes(red);
                  const count = ensayos.filter((e) => e.red === red).length;
                  return (
                    <label
                      key={red}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "12px 16px",
                        background: checked ? "#16213e" : "#0f2040",
                        border: `1px solid ${checked ? "#3dbb6e" : "#1a4a80"}`,
                        borderRadius: 10,
                        cursor: "pointer",
                        color: "#aac4e0",
                        fontSize: 14,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setSelectedRedes((prev) =>
                            checked ? prev.filter((r) => r !== red) : [...prev, red]
                          )
                        }
                        style={{ accentColor: "#3dbb6e" }}
                      />
                      <span style={{ flex: 1 }}>{red || "(sin red)"}</span>
                      <span style={{ color: "#4a6a8a", fontSize: 12 }}>{count} ensayo{count > 1 ? "s" : ""}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Continue button */}
          {canProceed && (
            <div style={{ marginTop: 20 }}>
              <button
                onClick={() => setStep(3)}
                style={{
                  width: "100%",
                  padding: "14px",
                  background: "#3dbb6e",
                  border: "none",
                  borderRadius: 12,
                  color: "#fff",
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Ver comparación →
              </button>
            </div>
          )}
        </div>
      </main>
    );
  }

  // ── Step 3: Comparison ───────────────────────────────────────────────────────

  const filterLabel =
    filterMode === "mapa"
      ? `${selectedLocalidades.length} localidad${selectedLocalidades.length > 1 ? "es" : ""}`
      : selectedRedes.join(", ");

  return (
    <main style={{ background: "#1a1a2e", minHeight: "100vh", padding: "16px" }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        {/* Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
          <button onClick={goStep2} style={{ background: "none", border: "none", color: "#4a6a8a", cursor: "pointer", fontSize: 13 }}>
            ← Filtro
          </button>
          <span style={{ color: "#2a4060" }}>·</span>
          <span style={{ color: "#e2b04a", fontSize: 13 }}>
            {cultivo === "maiz" ? "🌽 Maíz" : "🌱 Soja"} · {filterLabel}
          </span>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0,1fr) minmax(0,1.6fr)",
            gap: 20,
          }}
          className="comparacion-grid"
        >
          {/* Left: hybrid selectors */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div
              style={{
                background: "#16213e",
                borderRadius: 12,
                padding: 16,
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              <h2 style={{ color: "#e2b04a", fontWeight: 700, fontSize: 15, margin: 0 }}>
                Elegí híbridos
              </h2>
              <p style={{ color: "#4a6a8a", fontSize: 12, margin: 0 }}>
                {hibridosDisponibles.length} disponibles en la selección
              </p>
              {["A", "B", "C", "D"].map((label, i) => (
                <HybridSelect
                  key={label}
                  label={`Híbrido ${label}`}
                  value={hibridos[i]}
                  onChange={(v) => setHibridos((prev) => prev.map((h, j) => (j === i ? v : h)))}
                  options={hibridosDisponibles}
                  color={COLORS[i]}
                  required={i < 2}
                />
              ))}
            </div>

            {/* Head-to-head summary cards */}
            {hasResults && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {stats.slice(1).map((s) => (
                  <HeadToHead key={s.name} a={stats[0]} b={s} />
                ))}
              </div>
            )}
          </div>

          {/* Right: charts */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {activeHibridos.length === 0 && (
              <div
                style={{
                  background: "#16213e",
                  borderRadius: 12,
                  padding: 32,
                  textAlign: "center",
                  color: "#4a6a8a",
                  fontSize: 14,
                }}
              >
                Seleccioná al menos 2 híbridos para ver la comparación.
              </div>
            )}

            {activeHibridos.length >= 1 && (
              <div style={{ background: "#16213e", borderRadius: 12, padding: 16 }}>
                <h3 style={{ color: "#e2b04a", fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
                  Rendimiento medio
                </h3>
                <BarChart stats={stats} />
              </div>
            )}

            {hasResults && (
              <div style={{ background: "#16213e", borderRadius: 12, padding: 16 }}>
                <h3 style={{ color: "#e2b04a", fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
                  Respuesta al ambiente
                </h3>
                <RegressionChart stats={stats} ia={ia} />
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 640px) {
          .comparacion-grid { grid-template-columns: 1fr !important; }
        }
        .comparador-tooltip { background: #16213e; border: 1px solid #0f3460; color: #aac4e0; }
      `}</style>
    </main>
  );
}
