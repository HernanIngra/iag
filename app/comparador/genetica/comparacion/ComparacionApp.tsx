"use client";

import "leaflet/dist/leaflet.css";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { fetchEnsayosConEntradas } from "@/lib/comparador-db";
import type { EnsayoConEntradas } from "@/lib/comparador-types";

// ── Constants ─────────────────────────────────────────────────────────────────

const COLOR_A = "#e2b04a";
const COLOR_B = "#4a9ee2";

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

interface DiffResult {
  name: string;
  diff: number;
  n: number;
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

function headToHead(a: HybridStats, b: HybridStats): DiffResult {
  const common = Object.keys(a.byLocalidad).filter(
    (loc) => b.byLocalidad[loc] !== undefined
  );
  if (common.length === 0) return { name: b.name, diff: 0, n: 0 };
  const diffs = common.map((loc) => a.byLocalidad[loc] - b.byLocalidad[loc]);
  return {
    name: b.name,
    diff: diffs.reduce((x, y) => x + y, 0) / diffs.length,
    n: common.length,
  };
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

// ── SVG Regression Chart (h2h) ────────────────────────────────────────────────

function RegressionChart({
  sA,
  sB,
  ia,
}: {
  sA: HybridStats;
  sB: HybridStats;
  ia: Record<string, number>;
}) {
  const stats = [sA, sB];
  const colors = [COLOR_A, COLOR_B];

  const allPoints = stats.flatMap((s) =>
    Object.entries(s.byLocalidad)
      .filter(([loc]) => ia[loc] !== undefined)
      .map(([loc, rend]) => ({ x: ia[loc], y: rend }))
  );
  if (allPoints.length < 2) return null;

  const ml = 60;
  const mr = 20;
  const mt = 20;
  const mb = 52;
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
  const xPad = (xMax - xMin) * 0.08 || 500;
  const yPad = (yMax - yMin) * 0.1 || 500;
  const x0 = xMin - xPad;
  const x1 = xMax + xPad;
  const y0 = yMin - yPad;
  const y1 = yMax + yPad;

  const sx = (v: number) => ml + ((v - x0) / (x1 - x0)) * pw;
  const sy = (v: number) => mt + ph - ((v - y0) / (y1 - y0)) * ph;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: W, display: "block" }}>
      {/* Grid lines */}
      {Array.from({ length: 5 }).map((_, i) => {
        const v = y0 + (i / 4) * (y1 - y0);
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
      {Array.from({ length: 5 }).map((_, i) => {
        const v = x0 + (i / 4) * (x1 - x0);
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
      <text x={ml + pw / 2} y={H - 6} textAnchor="middle" fontSize={10} fill="#4a6a8a">
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
        const pts: [number, number][] = Object.entries(s.byLocalidad)
          .filter(([loc]) => ia[loc] !== undefined)
          .map(([loc, rend]) => [ia[loc], rend]);
        const reg = linReg(pts);
        if (!reg) return null;
        return (
          <line
            key={s.name}
            x1={sx(x0)}
            y1={sy(reg.slope * x0 + reg.intercept)}
            x2={sx(x1)}
            y2={sy(reg.slope * x1 + reg.intercept)}
            stroke={colors[i]}
            strokeWidth={1.5}
            strokeOpacity={0.55}
            strokeDasharray="5 3"
          />
        );
      })}

      {/* Points */}
      {stats.map((s, i) =>
        Object.entries(s.byLocalidad)
          .filter(([loc]) => ia[loc] !== undefined)
          .map(([loc, rend]) => (
            <circle
              key={`${s.name}-${loc}`}
              cx={sx(ia[loc])}
              cy={sy(rend)}
              r={5}
              fill={colors[i]}
              fillOpacity={0.85}
              stroke="#1a1a2e"
              strokeWidth={1}
            >
              <title>
                {s.name} · {loc}: {Math.round(rend).toLocaleString("es-AR")} kg/ha
              </title>
            </circle>
          ))
      )}

      {/* Legend */}
      {stats.map((s, i) => (
        <g key={s.name} transform={`translate(${ml + i * (pw / 2)}, ${H - 14})`}>
          <circle cx={6} cy={0} r={4} fill={colors[i]} />
          <text x={14} y={4} fontSize={9} fill="#aac4e0">
            {s.name.length > 22 ? s.name.slice(0, 21) + "…" : s.name}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ── SVG Diverging Bar Chart (uno vs varios) ───────────────────────────────────

function DivergingBarChart({
  results,
  headName,
}: {
  results: DiffResult[];
  headName: string;
}) {
  if (results.length === 0) return null;
  const maxAbs = Math.max(...results.map((r) => Math.abs(r.diff)), 1);
  const rowH = 46;
  const labelW = 190;
  const barMaxW = 190;
  const annotW = 96;
  const totalW = labelW + barMaxW * 2 + annotW;
  const height = 36 + results.length * rowH + 16;
  const centerX = labelW + barMaxW;

  return (
    <svg
      viewBox={`0 0 ${totalW} ${height}`}
      style={{ width: "100%", maxWidth: totalW, display: "block" }}
    >
      {/* Column headers */}
      <text x={centerX - 10} y={20} textAnchor="end" fontSize={9} fill="#4a6a8a">
        ← otro gana
      </text>
      <text x={centerX + 10} y={20} textAnchor="start" fontSize={9} fill="#4a6a8a">
        {headName.length > 14 ? headName.slice(0, 13) + "…" : headName} gana →
      </text>

      {/* Center line */}
      <line x1={centerX} y1={26} x2={centerX} y2={height - 8} stroke="#2a4060" strokeWidth={1} />

      {results.map((r, i) => {
        const y = 30 + i * rowH;
        const barW = (Math.abs(r.diff) / maxAbs) * barMaxW;
        const wins = r.diff >= 0;
        const color = wins ? "#3dbb6e" : "#e24a7a";
        const barX = wins ? centerX : centerX - barW;
        const shortName = r.name.length > 26 ? r.name.slice(0, 25) + "…" : r.name;
        const annotX = wins ? centerX + barW + 6 : centerX - barW - 6;
        const annotAnchor = wins ? "start" : "end";
        const diffText = `${wins ? "+" : ""}${Math.round(r.diff).toLocaleString("es-AR")} kg/ha`;

        return (
          <g key={r.name}>
            <text x={labelW - 8} y={y + rowH / 2 + 4} textAnchor="end" fontSize={11} fill="#aac4e0">
              {shortName}
            </text>
            {barW > 0 && (
              <rect
                x={barX}
                y={y + 8}
                width={barW}
                height={rowH - 16}
                rx={3}
                fill={color}
                fillOpacity={0.8}
              />
            )}
            <text
              x={annotX}
              y={y + rowH / 2 + 2}
              textAnchor={annotAnchor}
              fontSize={11}
              fill={color}
              fontWeight="600"
            >
              {diffText}
            </text>
            <text
              x={annotX}
              y={y + rowH / 2 + 15}
              textAnchor={annotAnchor}
              fontSize={9}
              fill="#4a6a8a"
            >
              n={r.n}
            </text>
          </g>
        );
      })}
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  color: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setSearch(value); }, [value]);

  useEffect(() => {
    function h(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const filtered = options
    .filter((o) => o.toLowerCase().includes(search.toLowerCase()))
    .slice(0, 12);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <label style={{ display: "block", fontSize: 11, color, fontWeight: 600, marginBottom: 4 }}>
        {label}
      </label>
      <div style={{ position: "relative" }}>
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Buscar híbrido…"
          style={{
            width: "100%",
            background: "#0f2040",
            border: `1px solid ${value ? color : "#1a4a80"}`,
            borderRadius: 8,
            padding: "8px 32px 8px 10px",
            color: "#e0e0e0",
            fontSize: 13,
            outline: "none",
            boxSizing: "border-box",
          }}
        />
        {value && (
          <button
            onClick={() => { onChange(""); setSearch(""); }}
            style={{
              position: "absolute",
              right: 8,
              top: "50%",
              transform: "translateY(-50%)",
              background: "none",
              border: "none",
              color: "#4a6a8a",
              cursor: "pointer",
              fontSize: 16,
              padding: 0,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        )}
      </div>
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
              onMouseDown={() => { onChange(o); setSearch(o); setOpen(false); }}
              style={{
                padding: "8px 12px",
                cursor: "pointer",
                fontSize: 12,
                color: "#aac4e0",
                borderBottom: "1px solid #0f2040",
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "#1a3060")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
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
    const m = new Map<string, { lat: number; lng: number; institucion: string }>();
    for (const e of ensayos) {
      if (e.lat !== null && e.lng !== null && !m.has(e.localidad)) {
        m.set(e.localidad, { lat: e.lat, lng: e.lng, institucion: e.institucion });
      }
    }
    return m;
  }, [ensayos]);

  const onToggleRef = useRef(onToggle);
  onToggleRef.current = onToggle;

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

  useEffect(() => {
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
          const initials = institucion.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
          const iconHtml = logoSrc
            ? `<img src="${logoSrc}" style="width:36px;height:36px;border-radius:50%;border:3px solid ${border};object-fit:cover;" />`
            : `<div style="width:36px;height:36px;border-radius:50%;background:#1a4a80;border:3px solid ${border};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#e2b04a;">${initials}</div>`;
          const icon = L.divIcon({ html: iconHtml, className: "", iconSize: [42, 42], iconAnchor: [21, 21] });
          const marker = L.marker([lat, lng], { icon })
            .addTo(map)
            .bindTooltip(
              `<strong>${loc}</strong><br><span style="color:#6a8ab0;font-size:11px">${institucion}</span>`,
              { direction: "top" }
            )
            .on("click", () => onToggleRef.current(loc));
          markers.set(loc, marker);
        });
      });
    }
    if (!mapRef.current) {
      const t = setTimeout(drawMarkers, 300);
      return () => clearTimeout(t);
    }
    drawMarkers();
  }, [localidades, selectedLocalidades]);

  return (
    <div ref={containerRef} style={{ width: "100%", height: "380px", borderRadius: 12, overflow: "hidden" }} />
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

  // Comparison mode
  const [compareMode, setCompareMode] = useState<"h2h" | "vs_all" | null>(null);
  const [hibridoA, setHibridoA] = useState("");
  const [hibridoB, setHibridoB] = useState("");
  const [hibridoHead, setHibridoHead] = useState("");

  const [ensayos, setEnsayos] = useState<EnsayoConEntradas[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!cultivo) return;
    setLoading(true);
    setError(null);
    fetchEnsayosConEntradas(supabase, { cultivo })
      .then((data) => { setEnsayos(data); setLoading(false); })
      .catch((e) => { setError(String(e)); setLoading(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cultivo]);

  const redes = useMemo(() => [...new Set(ensayos.map((e) => e.red))].sort(), [ensayos]);

  const ensayosFiltrados = useMemo(() => {
    if (filterMode === "mapa") return ensayos.filter((e) => selectedLocalidades.includes(e.localidad));
    if (filterMode === "red") return ensayos.filter((e) => selectedRedes.includes(e.red));
    return [];
  }, [ensayos, filterMode, selectedLocalidades, selectedRedes]);

  const hibridosDisponibles = useMemo(() => {
    const set = new Set<string>();
    for (const e of ensayosFiltrados) {
      for (const entry of e.entradas) set.add(entry.hibrido);
    }
    return [...set].sort();
  }, [ensayosFiltrados]);

  const ia = useMemo(() => computeIA(ensayosFiltrados), [ensayosFiltrados]);

  // h2h stats
  const statsA = useMemo(
    () => (hibridoA ? computeHybridStats(hibridoA, ensayosFiltrados) : null),
    [hibridoA, ensayosFiltrados]
  );
  const statsB = useMemo(
    () => (hibridoB ? computeHybridStats(hibridoB, ensayosFiltrados) : null),
    [hibridoB, ensayosFiltrados]
  );
  const h2hResult = useMemo(
    () => (statsA && statsB ? headToHead(statsA, statsB) : null),
    [statsA, statsB]
  );

  // vs_all: head vs every other hybrid
  const statsHead = useMemo(
    () => (hibridoHead ? computeHybridStats(hibridoHead, ensayosFiltrados) : null),
    [hibridoHead, ensayosFiltrados]
  );
  const vsAllResults = useMemo((): DiffResult[] => {
    if (!statsHead) return [];
    return hibridosDisponibles
      .filter((h) => h !== hibridoHead)
      .map((h) => {
        const other = computeHybridStats(h, ensayosFiltrados);
        return headToHead(statsHead, other);
      })
      .filter((r) => r.n > 0)
      .sort((a, b) => b.diff - a.diff);
  }, [statsHead, hibridosDisponibles, hibridoHead, ensayosFiltrados]);

  const canProceed =
    filterMode === "mapa" ? selectedLocalidades.length > 0 : selectedRedes.length > 0;

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
    setCompareMode(null);
    setHibridoA("");
    setHibridoB("");
    setHibridoHead("");
    setEnsayos([]);
  }

  function goStep2() {
    setStep(2);
    setFilterMode(null);
    setSelectedLocalidades([]);
    setSelectedRedes([]);
    setCompareMode(null);
    setHibridoA("");
    setHibridoB("");
    setHibridoHead("");
  }

  // ── Step 1: Cultivo ──────────────────────────────────────────────────────────

  if (step === 1) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center px-6" style={{ background: "#1a1a2e", minHeight: "100vh" }}>
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
              onClick={() => { setCultivo("maiz"); setStep(2); }}
              style={{
                flex: 1, padding: "28px 16px", background: "#16213e",
                border: "2px solid #3dbb6e", borderRadius: 16, color: "#e0e0e0",
                fontSize: 16, fontWeight: 700, cursor: "pointer",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
              }}
            >
              <span style={{ fontSize: 40 }}>🌽</span>
              Maíz
            </button>
            <button
              onClick={() => { setCultivo("soja"); setStep(2); }}
              style={{
                flex: 1, padding: "28px 16px", background: "#16213e",
                border: "2px solid #1a4a80", borderRadius: 16, color: "#6a8ab0",
                fontSize: 16, fontWeight: 700, cursor: "pointer",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
              }}
            >
              <span style={{ fontSize: 40 }}>🌱</span>
              Soja
              <span style={{ fontSize: 10, background: "#0f3460", color: "#4a6a8a", borderRadius: 8, padding: "2px 8px" }}>
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

          {!filterMode && (
            <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
              {(["mapa", "red"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setFilterMode(mode)}
                  disabled={loading}
                  style={{
                    flex: 1, padding: "20px 16px", background: "#16213e",
                    border: "2px solid #1a4a80", borderRadius: 16, color: "#aac4e0",
                    fontSize: 15, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer",
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                    opacity: loading ? 0.5 : 1,
                  }}
                >
                  <span style={{ fontSize: 32 }}>{mode === "mapa" ? "🗺" : "📋"}</span>
                  {mode === "mapa" ? "Por mapa" : "Por red"}
                  <span style={{ fontSize: 11, color: "#4a6a8a" }}>
                    {mode === "mapa" ? "Elegí localidades en el mapa" : "Filtrá por red de ensayos"}
                  </span>
                </button>
              ))}
            </div>
          )}

          {filterMode === "mapa" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <button onClick={() => setFilterMode(null)} style={{ background: "none", border: "none", color: "#4a6a8a", cursor: "pointer", fontSize: 12 }}>
                  ← Cambiar modo
                </button>
                <span style={{ color: "#4a6a8a", fontSize: 12 }}>Clickeá localidades para seleccionarlas</span>
                {selectedLocalidades.length > 0 && (
                  <span style={{ background: "#1a4a80", color: "#e2b04a", borderRadius: 20, padding: "2px 10px", fontSize: 12, fontWeight: 700 }}>
                    {selectedLocalidades.length} seleccionada{selectedLocalidades.length > 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <LocalidadMap ensayos={ensayos} selectedLocalidades={selectedLocalidades} onToggle={toggleLocalidad} />
              {selectedLocalidades.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
                  {selectedLocalidades.map((loc) => (
                    <span
                      key={loc}
                      onClick={() => toggleLocalidad(loc)}
                      style={{ background: "#16213e", border: "1px solid #e2b04a", color: "#e2b04a", borderRadius: 20, padding: "3px 10px", fontSize: 12, cursor: "pointer" }}
                    >
                      {loc} ×
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {filterMode === "red" && (
            <div>
              <div style={{ marginBottom: 16 }}>
                <button onClick={() => setFilterMode(null)} style={{ background: "none", border: "none", color: "#4a6a8a", cursor: "pointer", fontSize: 12 }}>
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
                        display: "flex", alignItems: "center", gap: 12,
                        padding: "12px 16px",
                        background: checked ? "#16213e" : "#0f2040",
                        border: `1px solid ${checked ? "#3dbb6e" : "#1a4a80"}`,
                        borderRadius: 10, cursor: "pointer", color: "#aac4e0", fontSize: 14,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setSelectedRedes((prev) => checked ? prev.filter((r) => r !== red) : [...prev, red])}
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

          {canProceed && (
            <div style={{ marginTop: 20 }}>
              <button
                onClick={() => setStep(3)}
                style={{ width: "100%", padding: "14px", background: "#3dbb6e", border: "none", borderRadius: 12, color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer" }}
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

        {/* Mode selector */}
        {!compareMode && (
          <div>
            <h2 style={{ color: "#e0e0e0", fontSize: 18, fontWeight: 700, marginBottom: 6 }}>
              ¿Cómo querés comparar?
            </h2>
            <p style={{ color: "#4a6a8a", fontSize: 13, marginBottom: 20 }}>
              {hibridosDisponibles.length} híbridos disponibles en la selección
            </p>
            <div style={{ display: "flex", gap: 16 }}>
              <button
                onClick={() => setCompareMode("h2h")}
                style={{
                  flex: 1, padding: "22px 16px", background: "#16213e",
                  border: "2px solid #1a4a80", borderRadius: 14, color: "#aac4e0",
                  fontSize: 15, fontWeight: 600, cursor: "pointer",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                }}
              >
                <span style={{ fontSize: 30 }}>⚔️</span>
                Cabeza a cabeza
                <span style={{ fontSize: 11, color: "#4a6a8a" }}>
                  1 vs 1 · gráfico de regresión
                </span>
              </button>
              <button
                onClick={() => setCompareMode("vs_all")}
                style={{
                  flex: 1, padding: "22px 16px", background: "#16213e",
                  border: "2px solid #1a4a80", borderRadius: 14, color: "#aac4e0",
                  fontSize: 15, fontWeight: 600, cursor: "pointer",
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                }}
              >
                <span style={{ fontSize: 30 }}>📊</span>
                Uno vs varios
                <span style={{ fontSize: 11, color: "#4a6a8a" }}>
                  Comparaciones múltiples en kg de diferencia
                </span>
              </button>
            </div>
          </div>
        )}

        {/* ── Cabeza a cabeza ────────────────────────────────────────────────── */}
        {compareMode === "h2h" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <button onClick={() => { setCompareMode(null); setHibridoA(""); setHibridoB(""); }} style={{ background: "none", border: "none", color: "#4a6a8a", cursor: "pointer", fontSize: 12 }}>
                ← Cambiar modo
              </button>
              <span style={{ color: "#e2b04a", fontSize: 13, fontWeight: 700 }}>⚔️ Cabeza a cabeza</span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }} className="h2h-selectors">
              <HybridSelect
                label="Híbrido A"
                value={hibridoA}
                onChange={setHibridoA}
                options={hibridosDisponibles.filter((h) => h !== hibridoB)}
                color={COLOR_A}
              />
              <HybridSelect
                label="Híbrido B"
                value={hibridoB}
                onChange={setHibridoB}
                options={hibridosDisponibles.filter((h) => h !== hibridoA)}
                color={COLOR_B}
              />
            </div>

            {/* Difference card */}
            {h2hResult && h2hResult.n > 0 && statsA && statsB && (
              <div style={{ marginBottom: 20 }}>
                <div
                  style={{
                    background: "#16213e",
                    borderRadius: 12,
                    padding: "16px 20px",
                    display: "flex",
                    alignItems: "center",
                    gap: 20,
                    flexWrap: "wrap",
                  }}
                >
                  {/* Winner */}
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <p style={{ color: "#6a8ab0", fontSize: 11, marginBottom: 4 }}>
                      {h2hResult.diff >= 0 ? "A gana" : "B gana"}
                    </p>
                    <p style={{ color: "#3dbb6e", fontSize: 28, fontWeight: 800, lineHeight: 1 }}>
                      +{Math.abs(Math.round(h2hResult.diff)).toLocaleString("es-AR")}{" "}
                      <span style={{ fontSize: 14, fontWeight: 400 }}>kg/ha</span>
                    </p>
                    <p style={{ color: "#4a6a8a", fontSize: 12, marginTop: 4 }}>
                      en {h2hResult.n} localidad{h2hResult.n > 1 ? "es" : ""} en común
                    </p>
                  </div>

                  {/* Individual means */}
                  <div style={{ display: "flex", gap: 20 }}>
                    {[{ s: statsA, color: COLOR_A }, { s: statsB, color: COLOR_B }].map(({ s, color }) => (
                      <div key={s.name} style={{ textAlign: "center" }}>
                        <p style={{ fontSize: 10, color, fontWeight: 600, marginBottom: 2 }}>
                          {s.name.length > 16 ? s.name.slice(0, 15) + "…" : s.name}
                        </p>
                        <p style={{ fontSize: 20, fontWeight: 700, color: "#e0e0e0" }}>
                          {Math.round(s.mean).toLocaleString("es-AR")}
                        </p>
                        <p style={{ fontSize: 10, color: "#4a6a8a" }}>kg/ha · n={s.n}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {h2hResult && h2hResult.n === 0 && hibridoA && hibridoB && (
              <p style={{ color: "#4a6a8a", background: "#0f2040", borderRadius: 8, padding: 12, marginBottom: 20, fontSize: 13 }}>
                No hay localidades en común entre los dos híbridos en la selección actual.
              </p>
            )}

            {/* Regression chart */}
            {statsA && statsB && h2hResult && h2hResult.n > 0 && (
              <div style={{ background: "#16213e", borderRadius: 12, padding: 16 }}>
                <h3 style={{ color: "#e2b04a", fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
                  Respuesta al ambiente
                </h3>
                <RegressionChart sA={statsA} sB={statsB} ia={ia} />
              </div>
            )}

            {(!hibridoA || !hibridoB) && (
              <div style={{ background: "#16213e", borderRadius: 12, padding: 32, textAlign: "center", color: "#4a6a8a", fontSize: 14 }}>
                Seleccioná los dos híbridos para ver la comparación.
              </div>
            )}
          </div>
        )}

        {/* ── Uno vs varios ─────────────────────────────────────────────────── */}
        {compareMode === "vs_all" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <button onClick={() => { setCompareMode(null); setHibridoHead(""); }} style={{ background: "none", border: "none", color: "#4a6a8a", cursor: "pointer", fontSize: 12 }}>
                ← Cambiar modo
              </button>
              <span style={{ color: "#e2b04a", fontSize: 13, fontWeight: 700 }}>📊 Uno vs varios</span>
            </div>

            <div style={{ maxWidth: 400, marginBottom: 20 }}>
              <HybridSelect
                label="Híbrido cabeza"
                value={hibridoHead}
                onChange={setHibridoHead}
                options={hibridosDisponibles}
                color={COLOR_A}
              />
            </div>

            {hibridoHead && vsAllResults.length === 0 && (
              <p style={{ color: "#4a6a8a", background: "#0f2040", borderRadius: 8, padding: 12, fontSize: 13 }}>
                No hay comparaciones disponibles para {hibridoHead} en la selección actual.
              </p>
            )}

            {vsAllResults.length > 0 && (
              <div style={{ background: "#16213e", borderRadius: 12, padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
                  <h3 style={{ color: "#e2b04a", fontSize: 14, fontWeight: 700 }}>
                    Diferencias vs {hibridoHead.length > 20 ? hibridoHead.slice(0, 19) + "…" : hibridoHead}
                  </h3>
                  <span style={{ color: "#4a6a8a", fontSize: 12 }}>
                    {vsAllResults.length} comparaciones
                  </span>
                </div>
                <DivergingBarChart results={vsAllResults} headName={hibridoHead} />
              </div>
            )}

            {!hibridoHead && (
              <div style={{ background: "#16213e", borderRadius: 12, padding: 32, textAlign: "center", color: "#4a6a8a", fontSize: 14 }}>
                Seleccioná el híbrido cabeza para ver sus comparaciones.
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        @media (max-width: 560px) {
          .h2h-selectors { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </main>
  );
}
