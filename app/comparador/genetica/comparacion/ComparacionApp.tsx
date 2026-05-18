"use client";

import "leaflet/dist/leaflet.css";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { fetchEnsayosConEntradas } from "@/lib/comparador-db";
import type { EnsayoConEntradas } from "@/lib/comparador-types";
import type { InaseCatalogEntry } from "@/lib/comparador-types";
import {
  pairedTTest,
  buildYieldMatrix,
  computeOutlierKeys,
  sigLabel,
} from "@/lib/comparador-stats";

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
  winPct?: number;
  pVal?: number;
}

function computeHybridStats(
  name: string,
  ensayos: EnsayoConEntradas[],
  excludeKeys?: Set<string>
): HybridStats {
  const byLoc: Record<string, number[]> = {};
  for (const e of ensayos) {
    if (excludeKeys?.has(`${e.localidad}|${name}`)) continue;
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

function computeIA(
  ensayos: EnsayoConEntradas[],
  excludeKeys?: Set<string>
): Record<string, number> {
  const byLoc: Record<string, number[]> = {};
  for (const e of ensayos) {
    for (const entry of e.entradas) {
      if (excludeKeys?.has(`${e.localidad}|${entry.hibrido}`)) continue;
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
  const diff = diffs.reduce((x, y) => x + y, 0) / diffs.length;
  const winPct = diffs.filter((d) => d > 0).length / diffs.length;
  let pVal: number | undefined;
  if (diffs.length >= 2) {
    const tt = pairedTTest(diffs);
    if (tt) pVal = tt.pValue;
  }
  return { name: b.name, diff, n: common.length, winPct, pVal };
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

// ── SVG Regression Chart ──────────────────────────────────────────────────────

function RegressionChart({ sA, sB, ia }: { sA: HybridStats; sB: HybridStats; ia: Record<string, number> }) {
  const stats = [sA, sB];
  const colors = [COLOR_A, COLOR_B];

  const allPoints = stats.flatMap((s) =>
    Object.entries(s.byLocalidad)
      .filter(([loc]) => ia[loc] !== undefined)
      .map(([loc, rend]) => ({ x: ia[loc], y: rend }))
  );
  if (allPoints.length < 2) return null;

  const ml = 60; const mr = 20; const mt = 20; const mb = 52;
  const W = 520; const H = 300;
  const pw = W - ml - mr; const ph = H - mt - mb;

  const xs = allPoints.map((p) => p.x);
  const ys = allPoints.map((p) => p.y);
  const xPad = (Math.max(...xs) - Math.min(...xs)) * 0.08 || 500;
  const yPad = (Math.max(...ys) - Math.min(...ys)) * 0.1 || 500;
  const x0 = Math.min(...xs) - xPad; const x1 = Math.max(...xs) + xPad;
  const y0 = Math.min(...ys) - yPad; const y1 = Math.max(...ys) + yPad;

  const sx = (v: number) => ml + ((v - x0) / (x1 - x0)) * pw;
  const sy = (v: number) => mt + ph - ((v - y0) / (y1 - y0)) * ph;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: W, display: "block" }}>
      {Array.from({ length: 5 }).map((_, i) => {
        const v = y0 + (i / 4) * (y1 - y0);
        return (
          <g key={i}>
            <line x1={ml} y1={sy(v)} x2={ml + pw} y2={sy(v)} stroke="#1a3060" strokeWidth={1} />
            <text x={ml - 6} y={sy(v) + 4} fontSize={9} fill="#4a6a8a" textAnchor="end">{Math.round(v / 100) * 100}</text>
          </g>
        );
      })}
      {Array.from({ length: 5 }).map((_, i) => {
        const v = x0 + (i / 4) * (x1 - x0);
        return <text key={i} x={sx(v)} y={H - mb + 16} fontSize={9} fill="#4a6a8a" textAnchor="middle">{Math.round(v / 100) * 100}</text>;
      })}
      <line x1={ml} y1={mt} x2={ml} y2={mt + ph} stroke="#2a4060" strokeWidth={1} />
      <line x1={ml} y1={mt + ph} x2={ml + pw} y2={mt + ph} stroke="#2a4060" strokeWidth={1} />
      <text x={ml + pw / 2} y={H - 6} textAnchor="middle" fontSize={10} fill="#4a6a8a">Índice Ambiental (kg/ha)</text>
      <text x={12} y={mt + ph / 2} textAnchor="middle" fontSize={10} fill="#4a6a8a" transform={`rotate(-90, 12, ${mt + ph / 2})`}>Rendimiento (kg/ha)</text>
      {stats.map((s, i) => {
        const pts: [number, number][] = Object.entries(s.byLocalidad).filter(([loc]) => ia[loc] !== undefined).map(([loc, rend]) => [ia[loc], rend]);
        const reg = linReg(pts);
        if (!reg) return null;
        return <line key={s.name} x1={sx(x0)} y1={sy(reg.slope * x0 + reg.intercept)} x2={sx(x1)} y2={sy(reg.slope * x1 + reg.intercept)} stroke={colors[i]} strokeWidth={1.5} strokeOpacity={0.55} strokeDasharray="5 3" />;
      })}
      {stats.map((s, i) =>
        Object.entries(s.byLocalidad).filter(([loc]) => ia[loc] !== undefined).map(([loc, rend]) => (
          <circle key={`${s.name}-${loc}`} cx={sx(ia[loc])} cy={sy(rend)} r={5} fill={colors[i]} fillOpacity={0.85} stroke="#1a1a2e" strokeWidth={1}>
            <title>{s.name} · {loc}: {Math.round(rend).toLocaleString("es-AR")} kg/ha</title>
          </circle>
        ))
      )}
      {stats.map((s, i) => (
        <g key={s.name} transform={`translate(${ml + i * (pw / 2)}, ${H - 14})`}>
          <circle cx={6} cy={0} r={4} fill={colors[i]} />
          <text x={14} y={4} fontSize={9} fill="#aac4e0">{s.name.length > 22 ? s.name.slice(0, 21) + "…" : s.name}</text>
        </g>
      ))}
    </svg>
  );
}

// ── SVG Diverging Bar Chart ───────────────────────────────────────────────────

// ── Horizontal diverging bar chart (mobile) ───────────────────────────────────

function DivergingBarChart({ results, headName }: { results: DiffResult[]; headName: string }) {
  if (results.length === 0) return null;
  const maxAbs = Math.max(...results.map((r) => Math.abs(r.diff)), 1);
  const rowH = 46; const labelW = 190; const barMaxW = 190; const annotW = 96;
  const totalW = labelW + barMaxW * 2 + annotW;
  const height = 36 + results.length * rowH + 16;
  const centerX = labelW + barMaxW;

  return (
    <svg viewBox={`0 0 ${totalW} ${height}`} style={{ width: "100%", maxWidth: totalW, display: "block" }}>
      <text x={centerX - 10} y={20} textAnchor="end" fontSize={9} fill="#4a6a8a">← otro gana</text>
      <text x={centerX + 10} y={20} textAnchor="start" fontSize={9} fill="#4a6a8a">{headName.length > 14 ? headName.slice(0, 13) + "…" : headName} gana →</text>
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
        const sig = sigLabel(r.pVal);
        const tooltipText = [
          `n=${r.n}`,
          r.pVal !== undefined ? `p=${r.pVal.toFixed(3)}` : "",
          r.winPct !== undefined ? `${Math.round(r.winPct * 100)}% win` : "",
        ].filter(Boolean).join(" · ");
        return (
          <g key={r.name}>
            <text x={labelW - 8} y={y + rowH / 2 + 4} textAnchor="end" fontSize={11} fill="#aac4e0">{shortName}</text>
            {barW > 0 && (
              <rect x={barX} y={y + 8} width={barW} height={rowH - 16} rx={3} fill={color} fillOpacity={0.8}>
                <title>{tooltipText}</title>
              </rect>
            )}
            <text x={annotX} y={y + rowH / 2 + 2} textAnchor={annotAnchor} fontSize={11} fill={color} fontWeight="600">
              {wins ? "+" : ""}{Math.round(r.diff).toLocaleString("es-AR")} kg/ha{sig ? ` ${sig}` : ""}
            </text>
            <text x={annotX} y={y + rowH / 2 + 15} textAnchor={annotAnchor} fontSize={9} fill="#4a6a8a">n={r.n}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Vertical bar chart (tablet / desktop) ────────────────────────────────────

function VerticalDivergingBarChart({ results, headName }: { results: DiffResult[]; headName: string }) {
  if (results.length === 0) return null;
  const maxAbs = Math.max(...results.map((r) => Math.abs(r.diff)), 1);

  const colW = 52;
  const barMaxH = 120;
  const topM = 44;   // room for value labels above positive bars
  const botM = 90;   // room for rotated x-axis labels
  const leftM = 58;
  const rightM = 12;
  const totalW = leftM + results.length * colW + rightM;
  const totalH = topM + barMaxH * 2 + botM;
  const centerY = topM + barMaxH;
  const zeroX = leftM - 4;

  // Y-axis ticks: 3–4 steps
  const rawStep = maxAbs / 3.5;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const tickStep = Math.ceil(rawStep / mag) * mag;
  const ticks: number[] = [];
  for (let v = tickStep; v <= maxAbs * 1.01; v += tickStep) ticks.push(Math.round(v));

  function fmtKg(v: number) {
    return Math.abs(v) >= 1000
      ? `${v > 0 ? "+" : ""}${(v / 1000).toFixed(1)}k`
      : `${v > 0 ? "+" : ""}${v}`;
  }

  return (
    <svg
      viewBox={`0 0 ${totalW} ${totalH}`}
      style={{ width: totalW, minWidth: totalW, height: totalH, display: "block" }}
    >
      {/* Y-axis title */}
      <text transform={`rotate(-90,14,${centerY})`} x={14} y={centerY}
        textAnchor="middle" fontSize={9} fill="#4a6a8a">kg/ha</text>

      {/* Grid + tick labels */}
      {ticks.map((v) => (
        <g key={v}>
          {[v, -v].map((tv) => {
            const ty = centerY - (tv / maxAbs) * barMaxH;
            return (
              <g key={tv}>
                <line x1={zeroX} x2={totalW - rightM} y1={ty} y2={ty}
                  stroke="#1a3050" strokeWidth={0.5} strokeDasharray="3 3" />
                <text x={zeroX - 4} y={ty + 4} textAnchor="end" fontSize={9} fill="#4a6a8a">
                  {fmtKg(tv)}
                </text>
              </g>
            );
          })}
        </g>
      ))}

      {/* Center line (0) */}
      <line x1={zeroX} x2={totalW - rightM} y1={centerY} y2={centerY}
        stroke="#2a4060" strokeWidth={1.5} />
      <text x={zeroX - 4} y={centerY + 4} textAnchor="end" fontSize={9} fill="#4a6a8a">0</text>

      {/* "gana" labels */}
      <text x={leftM + 4} y={topM - 6} fontSize={8} fill="#4a6a8a">
        {headName.length > 15 ? headName.slice(0, 14) + "…" : headName} gana ↑
      </text>
      <text x={leftM + 4} y={centerY + barMaxH + 14} fontSize={8} fill="#4a6a8a">otro gana ↓</text>

      {/* Bars */}
      {results.map((r, i) => {
        const cx = leftM + i * colW + colW / 2;
        const barW = colW * 0.65;
        const bx = cx - barW / 2;
        const barH = (Math.abs(r.diff) / maxAbs) * barMaxH;
        const wins = r.diff >= 0;
        const color = wins ? "#3dbb6e" : "#e24a7a";
        const barY = wins ? centerY - barH : centerY;

        // value / n= label positioning
        const valY = wins ? barY - (barH > 18 ? 4 : 16) : barY + barH + (barH > 18 ? 12 : 12);
        const nY   = wins ? valY - 11 : valY + 11;

        // rotated name at bottom of chart area
        const rotY = centerY + barMaxH + 6;

        const sig = sigLabel(r.pVal);
        const tooltipText = [
          `n=${r.n}`,
          r.pVal !== undefined ? `p=${r.pVal.toFixed(3)}` : "",
          r.winPct !== undefined ? `${Math.round(r.winPct * 100)}% win` : "",
        ].filter(Boolean).join(" · ");
        return (
          <g key={r.name}>
            {barH > 0 && (
              <rect x={bx} y={barY} width={barW} height={barH} rx={3}
                fill={color} fillOpacity={0.82}>
                <title>{tooltipText}</title>
              </rect>
            )}
            <text x={cx} y={valY} textAnchor="middle" fontSize={9} fill={color} fontWeight="600">
              {wins ? "+" : ""}{Math.round(r.diff).toLocaleString("es-AR")}
            </text>
            {sig && (
              <text x={cx} y={nY} textAnchor="middle" fontSize={9} fill={color} fontWeight="700">{sig}</text>
            )}
            <text x={cx} y={sig ? nY + 11 : nY} textAnchor="middle" fontSize={8} fill="#4a6a8a">n={r.n}</text>
            <text
              transform={`rotate(-45,${cx},${rotY})`}
              x={cx} y={rotY}
              textAnchor="end"
              fontSize={10}
              fill="#aac4e0"
            >
              {r.name.length > 12 ? r.name.slice(0, 11) + "…" : r.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Hybrid Selector ───────────────────────────────────────────────────────────

function HybridSelect({
  label, value, onChange, options, color, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void; options: string[]; color: string; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setSearch(value); }, [value]);
  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  // Show more results when no search text; cap at 40
  const filtered = options
    .filter((o) => o.toLowerCase().includes(search.toLowerCase()))
    .slice(0, search.trim() ? 20 : 40);
  const totalMatching = options.filter((o) => o.toLowerCase().includes(search.toLowerCase())).length;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <label style={{ display: "block", fontSize: 11, color, fontWeight: 600, marginBottom: 4 }}>{label}</label>
      <div style={{ position: "relative" }}>
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder ?? "Buscar…"}
          style={{ width: "100%", background: "#0f2040", border: `1px solid ${value ? color : "#1a4a80"}`, borderRadius: 8, padding: "8px 32px 8px 10px", color: "#e0e0e0", fontSize: 13, outline: "none", boxSizing: "border-box" }}
        />
        {value && (
          <button onClick={() => { onChange(""); setSearch(""); }} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#4a6a8a", cursor: "pointer", fontSize: 16, padding: 0, lineHeight: 1 }}>×</button>
        )}
      </div>
      {open && (
        <ul style={{ position: "absolute", zIndex: 100, top: "100%", left: 0, right: 0, background: "#16213e", border: "1px solid #0f3460", borderRadius: 8, margin: "2px 0 0", padding: 0, listStyle: "none", maxHeight: 260, overflowY: "auto" }}>
          {filtered.map((o) => (
            <li
              key={o}
              onMouseDown={() => { onChange(o); setSearch(o); setOpen(false); }}
              style={{ padding: "8px 12px", cursor: "pointer", fontSize: 12, color: "#aac4e0", borderBottom: "1px solid #0f2040" }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "#1a3060")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
            >
              {o}
            </li>
          ))}
          {totalMatching > filtered.length && (
            <li style={{ padding: "6px 12px", fontSize: 11, color: "#4a6a8a", fontStyle: "italic", textAlign: "center" }}>
              {totalMatching - filtered.length} más · escribí para filtrar
            </li>
          )}
          {filtered.length === 0 && (
            <li style={{ padding: "8px 12px", fontSize: 12, color: "#4a6a8a" }}>Sin resultados</li>
          )}
        </ul>
      )}
    </div>
  );
}

// ── IA Range Slider ───────────────────────────────────────────────────────────

function IASlider({
  iaMin, iaMax, iaLow, iaHigh, iaVals, localidadesConIA, totalLocalidades,
  onChangeLow, onChangeHigh, eiCuts,
}: {
  iaMin: number; iaMax: number; iaLow: number; iaHigh: number;
  iaVals: number[]; localidadesConIA: number; totalLocalidades: number;
  onChangeLow: (v: number) => void; onChangeHigh: (v: number) => void;
  eiCuts?: number[];
}) {
  if (iaMin >= iaMax) return null;
  const trackRef = useRef<HTMLDivElement>(null);

  function makeThumbHandlers(thumb: "low" | "high") {
    return {
      onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
        e.currentTarget.setPointerCapture(e.pointerId);
      },
      onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        const rect = trackRef.current?.getBoundingClientRect();
        if (!rect) return;
        const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const val = Math.round((iaMin + pct * (iaMax - iaMin)) / 100) * 100;
        if (thumb === "low" && val < iaHigh) onChangeLow(val);
        if (thumb === "high" && val > iaLow) onChangeHigh(val);
      },
      onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => {
        e.currentTarget.releasePointerCapture(e.pointerId);
      },
    };
  }

  const pctLow = (iaLow - iaMin) / (iaMax - iaMin);
  const pctHigh = (iaHigh - iaMin) / (iaMax - iaMin);

  // Histogram buckets
  const BUCKETS = 12;
  const bucketCounts = Array(BUCKETS).fill(0) as number[];
  for (const v of iaVals) {
    const idx = Math.min(BUCKETS - 1, Math.floor(((v - iaMin) / (iaMax - iaMin)) * BUCKETS));
    bucketCounts[idx]++;
  }
  const maxCount = Math.max(...bucketCounts, 1);
  const histH = 36;
  const barW = 100 / BUCKETS;

  const allInRange = localidadesConIA === totalLocalidades;

  return (
    <div style={{ background: "#16213e", borderRadius: 10, padding: "12px 16px" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ color: "#e2b04a", fontSize: 12, fontWeight: 600 }}>Filtro por IA</span>
        <span style={{ fontSize: 12, color: allInRange ? "#6a8ab0" : "#e2b04a" }}>
          {allInRange
            ? `${totalLocalidades} localidad${totalLocalidades !== 1 ? "es" : ""}`
            : `${localidadesConIA} de ${totalLocalidades} localidades`}
        </span>
      </div>

      {/* Selected range values */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: "#3dbb6e", fontWeight: 600 }}>{Math.round(iaLow).toLocaleString("es-AR")}</span>
        <span style={{ fontSize: 10, color: "#4a6a8a" }}>kg/ha</span>
        <span style={{ fontSize: 11, color: "#3dbb6e", fontWeight: 600 }}>{Math.round(iaHigh).toLocaleString("es-AR")}</span>
      </div>

      {/* Histogram (desktop/tablet only) */}
      <div className="hidden md:block" style={{ marginBottom: 4 }}>
        <svg width="100%" height={histH} viewBox={`0 0 100 ${histH}`} preserveAspectRatio="none" style={{ display: "block", overflow: "visible" }}>
          {bucketCounts.map((count, i) => {
            const barH = (count / maxCount) * histH;
            const bucketMin = iaMin + (i / BUCKETS) * (iaMax - iaMin);
            const bucketMax = iaMin + ((i + 1) / BUCKETS) * (iaMax - iaMin);
            const inRange = bucketMax > iaLow && bucketMin < iaHigh;
            return (
              <rect key={i} x={i * barW + 0.3} y={histH - barH} width={barW - 0.6} height={barH} fill={inRange ? "#3dbb6e" : "#1a4a80"} rx={0.8} />
            );
          })}
          {/* Environment cut lines */}
          {(eiCuts ?? [])
            .filter((c) => c > iaMin && c < iaMax)
            .map((c) => {
              const pct = ((c - iaMin) / (iaMax - iaMin)) * 100;
              return (
                <g key={c}>
                  <line x1={pct} y1={0} x2={pct} y2={histH} stroke="#e2b04a" strokeWidth={0.8} strokeDasharray="2 2" />
                  <text x={pct + 0.5} y={8} fontSize={5} fill="#e2b04a">{Math.round(c / 1000)}k</text>
                </g>
              );
            })}
        </svg>
      </div>

      {/* Dual-range track */}
      <div ref={trackRef} style={{ position: "relative", height: 20, userSelect: "none" }}>
        <div style={{ position: "absolute", top: 7, left: 0, right: 0, height: 6, background: "#0f2040", borderRadius: 3 }} />
        <div style={{ position: "absolute", top: 7, left: `${pctLow * 100}%`, right: `${(1 - pctHigh) * 100}%`, height: 6, background: "#3dbb6e", borderRadius: 3 }} />
        {/* Low thumb */}
        <div
          style={{ position: "absolute", top: 2, left: `${pctLow * 100}%`, transform: "translateX(-50%)", width: 16, height: 16, background: "#3dbb6e", border: "2px solid #1a1a2e", borderRadius: "50%", cursor: "grab", touchAction: "none", zIndex: pctLow > 0.9 ? 2 : 1 }}
          {...makeThumbHandlers("low")}
        />
        {/* High thumb */}
        <div
          style={{ position: "absolute", top: 2, left: `${pctHigh * 100}%`, transform: "translateX(-50%)", width: 16, height: 16, background: "#3dbb6e", border: "2px solid #1a1a2e", borderRadius: "50%", cursor: "grab", touchAction: "none", zIndex: pctLow > 0.9 ? 1 : 2 }}
          {...makeThumbHandlers("high")}
        />
      </div>

      {/* Min/Max axis labels */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
        <span style={{ fontSize: 10, color: "#4a6a8a" }}>{Math.round(iaMin).toLocaleString("es-AR")}</span>
        <span style={{ fontSize: 10, color: "#4a6a8a" }}>{Math.round(iaMax).toLocaleString("es-AR")}</span>
      </div>
    </div>
  );
}

// ── Company filter ────────────────────────────────────────────────────────────

function CompanyFilter({
  companies, selected, onChange,
}: {
  companies: string[]; selected: string; onChange: (v: string) => void;
}) {
  if (companies.length === 0) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <label style={{ fontSize: 11, color: "#6a8ab0", fontWeight: 600, flexShrink: 0 }}>Empresa</label>
      <select
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        style={{ flex: 1, background: "#0f2040", border: "1px solid #1a4a80", borderRadius: 8, padding: "7px 10px", color: selected ? "#e0e0e0" : "#4a6a8a", fontSize: 13, outline: "none" }}
      >
        <option value="">Todas las empresas</option>
        {companies.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
    </div>
  );
}

// ── Redes filter (in-comparison multi-select) ─────────────────────────────────

function RedesFilter({ redes, selected, onChange }: {
  redes: string[]; selected: string[]; onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function h(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  if (redes.length <= 1) return null;

  const label = selected.length === 0
    ? "Todas las redes"
    : selected.length === 1 ? selected[0] : `${selected.length} redes`;

  function toggle(r: string) {
    onChange(selected.includes(r) ? selected.filter((x) => x !== r) : [...selected, r]);
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, position: "relative" }} ref={ref}>
      <label style={{ fontSize: 11, color: "#6a8ab0", fontWeight: 600, flexShrink: 0 }}>Red</label>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          flex: 1, background: "#0f2040", border: `1px solid ${selected.length > 0 ? "#3dbb6e" : "#1a4a80"}`,
          borderRadius: 8, padding: "7px 10px", color: selected.length > 0 ? "#e0e0e0" : "#4a6a8a",
          fontSize: 13, outline: "none", textAlign: "left", cursor: "pointer", display: "flex", justifyContent: "space-between",
        }}
      >
        <span>{label}</span>
        <span style={{ color: "#4a6a8a", fontSize: 10 }}>▾</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "100%", left: 40, right: 0, zIndex: 50,
          background: "#16213e", border: "1px solid #1a4a80", borderRadius: 8,
          marginTop: 4, padding: "4px 0", boxShadow: "0 4px 16px #000a",
        }}>
          {selected.length > 0 && (
            <button
              onClick={() => onChange([])}
              style={{ width: "100%", textAlign: "left", padding: "8px 12px", background: "none", border: "none", borderBottom: "1px solid #0f3060", color: "#4a6a8a", fontSize: 11, cursor: "pointer" }}
            >
              ✕ Limpiar selección
            </button>
          )}
          {redes.map((r) => {
            const checked = selected.includes(r);
            return (
              <label key={r} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", cursor: "pointer", color: checked ? "#e0e0e0" : "#aac4e0", fontSize: 13, background: checked ? "#1a3060" : "transparent" }}>
                <input type="checkbox" checked={checked} onChange={() => toggle(r)} style={{ accentColor: "#3dbb6e" }} />
                {r || "(sin red)"}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Environment cuts editor ───────────────────────────────────────────────────

function EiCutsEditor({
  cuts, onChange, iaMin, iaMax,
}: {
  cuts: number[]; onChange: (cuts: number[]) => void; iaMin: number; iaMax: number;
}) {
  const sorted = [...cuts].sort((a, b) => a - b);

  function addCut() {
    if (cuts.length >= 3) return;
    let suggestion: number;
    if (cuts.length === 0) suggestion = Math.round(((iaMin + iaMax) / 2) / 500) * 500;
    else {
      const last = Math.max(...cuts);
      suggestion = Math.round(((last + iaMax) / 2) / 500) * 500;
    }
    onChange([...cuts, suggestion]);
  }

  function removeCut(val: number) {
    onChange(cuts.filter((c) => c !== val));
  }

  function updateCut(oldVal: number, newRaw: string) {
    const newVal = parseInt(newRaw, 10);
    if (isNaN(newVal)) return;
    onChange(cuts.map((c) => (c === oldVal ? newVal : c)));
  }

  return (
    <div style={{ background: "#16213e", borderRadius: 10, padding: "10px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ color: "#e2b04a", fontSize: 12, fontWeight: 600 }}>Rangos de ambiente</span>
        {cuts.length < 3 && (
          <button
            onClick={addCut}
            disabled={iaMin >= iaMax}
            style={{ background: "none", border: "1px solid #e2b04a", borderRadius: 6, color: "#e2b04a", fontSize: 11, padding: "2px 8px", cursor: "pointer" }}
          >
            + Corte
          </button>
        )}
      </div>
      {sorted.length === 0 ? (
        <p style={{ color: "#4a6a8a", fontSize: 11, margin: 0 }}>Sin rangos · agregá cortes para estratificar los ambientes</p>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          {sorted.map((c) => (
            <div key={c} style={{ display: "flex", alignItems: "center", gap: 4, background: "#0f2040", borderRadius: 6, padding: "3px 6px 3px 8px", border: "1px solid #2a4060" }}>
              <input
                type="number"
                value={c}
                onChange={(e) => updateCut(c, e.target.value)}
                style={{ width: 64, background: "none", border: "none", color: "#e2b04a", fontSize: 12, outline: "none", fontWeight: 600 }}
              />
              <span style={{ color: "#4a6a8a", fontSize: 10 }}>kg/ha</span>
              <button
                onClick={() => removeCut(c)}
                style={{ background: "none", border: "none", color: "#4a6a8a", cursor: "pointer", fontSize: 14, lineHeight: 1, padding: "0 2px" }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Outlier control ───────────────────────────────────────────────────────────

function OutlierControl({
  enabled, threshold, outlierCount, onChange, onChangeThreshold,
}: {
  enabled: boolean; threshold: number; outlierCount: number;
  onChange: (v: boolean) => void; onChangeThreshold: (v: number) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#16213e", borderRadius: 10, padding: "8px 14px" }}>
      <button
        onClick={() => onChange(!enabled)}
        style={{
          background: enabled ? "#1a4a30" : "#0f2040",
          border: `1px solid ${enabled ? "#3dbb6e" : "#2a4060"}`,
          borderRadius: 6, padding: "3px 10px", cursor: "pointer",
          color: enabled ? "#3dbb6e" : "#4a6a8a", fontSize: 12, fontWeight: 600,
        }}
      >
        {enabled ? "● Outliers" : "○ Outliers"}
      </button>
      {enabled && (
        <>
          <select
            value={threshold}
            onChange={(e) => onChangeThreshold(parseFloat(e.target.value))}
            style={{ background: "#0f2040", border: "1px solid #1a4a80", borderRadius: 6, padding: "2px 6px", color: "#aac4e0", fontSize: 11, outline: "none" }}
          >
            <option value={2.0}>2.0 σ</option>
            <option value={2.5}>2.5 σ</option>
            <option value={3.0}>3.0 σ</option>
          </select>
          <span style={{ fontSize: 11, color: outlierCount > 0 ? "#e2b04a" : "#4a6a8a" }}>
            {outlierCount > 0 ? `${outlierCount} obs. excluidas` : "Sin outliers"}
          </span>
        </>
      )}
    </div>
  );
}

// ── Map view ──────────────────────────────────────────────────────────────────

function LocalidadMap({ ensayos, selectedLocalidades, onToggle }: {
  ensayos: EnsayoConEntradas[]; selectedLocalidades: string[]; onToggle: (loc: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<{ map: unknown; markers: Map<string, unknown> } | null>(null);

  const localidades = useMemo(() => {
    const m = new Map<string, { lat: number; lng: number; institucion: string }>();
    for (const e of ensayos) {
      if (e.lat !== null && e.lng !== null && !m.has(e.localidad))
        m.set(e.localidad, { lat: e.lat, lng: e.lng, institucion: e.institucion });
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
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "" }).addTo(map);
      L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, opacity: 0.7, attribution: "" }).addTo(map);
      mapRef.current = { map, markers: new Map() };
    });
    return () => {
      destroyed = true;
      if (mapRef.current) { (mapRef.current.map as { remove: () => void }).remove(); mapRef.current = null; }
    };
  }, []);

  useEffect(() => {
    function draw() {
      if (!mapRef.current) return;
      import("leaflet").then((mod) => {
        if (!mapRef.current) return;
        const L = mod.default;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const map = mapRef.current.map as any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const markers = mapRef.current.markers as Map<string, any>;
        markers.forEach((m) => m.remove()); markers.clear();
        localidades.forEach(({ lat, lng, institucion }, loc) => {
          const selected = selectedLocalidades.includes(loc);
          const logoSrc = LOGO_MAP[institucion];
          const border = selected ? "#e2b04a" : "#3dbb6e";
          const initials = institucion.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
          const iconHtml = logoSrc
            ? `<img src="${logoSrc}" style="width:36px;height:36px;border-radius:50%;border:3px solid ${border};object-fit:cover;" />`
            : `<div style="width:36px;height:36px;border-radius:50%;background:#1a4a80;border:3px solid ${border};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#e2b04a;">${initials}</div>`;
          const icon = L.divIcon({ html: iconHtml, className: "", iconSize: [42, 42], iconAnchor: [21, 21] });
          const marker = L.marker([lat, lng], { icon }).addTo(map)
            .bindTooltip(`<strong>${loc}</strong><br><span style="color:#6a8ab0;font-size:11px">${institucion}</span>`, { direction: "top" })
            .on("click", () => onToggleRef.current(loc));
          markers.set(loc, marker);
        });
      });
    }
    if (!mapRef.current) { const t = setTimeout(draw, 300); return () => clearTimeout(t); }
    draw();
  }, [localidades, selectedLocalidades]);

  return <div ref={containerRef} style={{ width: "100%", height: "380px", borderRadius: 12, overflow: "hidden" }} />;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ComparacionApp() {
  const supabase = createSupabaseBrowserClient();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [cultivo, setCultivo] = useState<"maiz" | "soja" | null>(null);
  const [filterMode, setFilterMode] = useState<"mapa" | "red" | null>(null);
  const [selectedLocalidades, setSelectedLocalidades] = useState<string[]>([]);
  const [selectedRedes, setSelectedRedes] = useState<string[]>([]);

  const [compareMode, setCompareMode] = useState<"h2h" | "vs_all" | null>(null);
  const [hibridoA, setHibridoA] = useState("");
  const [hibridoB, setHibridoB] = useState("");
  const [hibridoHead, setHibridoHead] = useState("");
  const [selectedCompany, setSelectedCompany] = useState("");
  const [selectedRedesComp, setSelectedRedesComp] = useState<string[]>([]);

  // IA slider
  const [iaLow, setIaLow] = useState(0);
  const [iaHigh, setIaHigh] = useState(999999);

  // Statistical analysis
  const [outlierEnabled, setOutlierEnabled] = useState(true);
  const [outlierThreshold, setOutlierThreshold] = useState(2.5);
  const [eiCuts, setEiCuts] = useState<number[]>([]);

  const [ensayos, setEnsayos] = useState<EnsayoConEntradas[]>([]);
  const [catalog, setCatalog] = useState<InaseCatalogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load INASE catalog once
  useEffect(() => {
    fetch("/comparador/inase-catalog.json")
      .then((r) => r.json())
      .then(setCatalog)
      .catch(() => {});
  }, []);

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

  // Yield matrix and outlier detection (on pre-IA-filtered data, matching R code order)
  const yieldMatrix = useMemo(() => buildYieldMatrix(ensayosFiltrados), [ensayosFiltrados]);
  const outlierKeys = useMemo(
    () => (outlierEnabled ? computeOutlierKeys(yieldMatrix, outlierThreshold) : new Set<string>()),
    [yieldMatrix, outlierEnabled, outlierThreshold]
  );

  // IA per localidad — computed excluding outlier observations
  const ia = useMemo(
    () => computeIA(ensayosFiltrados, outlierEnabled ? outlierKeys : undefined),
    [ensayosFiltrados, outlierKeys, outlierEnabled]
  );

  const iaVals = Object.values(ia);
  const iaAbsMin = iaVals.length ? Math.floor(Math.min(...iaVals) / 100) * 100 : 0;
  const iaAbsMax = iaVals.length ? Math.ceil(Math.max(...iaVals) / 100) * 100 : 0;

  // Init slider range when IA changes
  useEffect(() => {
    if (iaVals.length === 0) return;
    setIaLow(iaAbsMin);
    setIaHigh(iaAbsMax);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iaAbsMin, iaAbsMax]);

  // Ensayos further filtered by IA range
  const ensayosFiltradosConIA = useMemo(() => {
    if (iaVals.length === 0) return ensayosFiltrados;
    return ensayosFiltrados.filter((e) => {
      const eIA = ia[e.localidad];
      if (eIA === undefined) return true;
      return eIA >= iaLow && eIA <= iaHigh;
    });
  }, [ensayosFiltrados, ia, iaLow, iaHigh, iaVals.length]);

  // Redes available after IA filter, for the in-comparison filter
  const redesDisponibles = useMemo(
    () => [...new Set(ensayosFiltradosConIA.map((e) => e.red))].sort(),
    [ensayosFiltradosConIA]
  );

  // Ensayos further filtered by selected redes (in-comparison filter)
  const ensayosFiltradosFinal = useMemo(() => {
    if (selectedRedesComp.length === 0) return ensayosFiltradosConIA;
    return ensayosFiltradosConIA.filter((e) => selectedRedesComp.includes(e.red));
  }, [ensayosFiltradosConIA, selectedRedesComp]);

  // All hybrids in final filtered ensayos
  const hibridosDisponibles = useMemo(() => {
    const set = new Set<string>();
    for (const e of ensayosFiltradosFinal) {
      for (const entry of e.entradas) set.add(entry.hibrido);
    }
    return [...set].sort();
  }, [ensayosFiltradosFinal]);

  // Map hybrid → company from INASE catalog
  const hybridCompanyMap = useMemo(() => {
    const especie = cultivo === "maiz" ? "MAIZ" : "SOJA";
    const map: Record<string, string> = {};
    for (const h of hibridosDisponibles) {
      const entry = catalog.find((e) => e.e === especie && e.c === h);
      if (entry?.s) map[h] = entry.s;
    }
    return map;
  }, [catalog, hibridosDisponibles, cultivo]);

  const empresasDisponibles = useMemo(() => {
    const set = new Set<string>();
    for (const h of hibridosDisponibles) {
      if (hybridCompanyMap[h]) set.add(hybridCompanyMap[h]);
    }
    return [...set].sort();
  }, [hibridosDisponibles, hybridCompanyMap]);

  const hibridosFiltradosPorEmpresa = useMemo(() => {
    if (!selectedCompany) return hibridosDisponibles;
    return hibridosDisponibles.filter((h) => hybridCompanyMap[h] === selectedCompany);
  }, [hibridosDisponibles, selectedCompany, hybridCompanyMap]);

  // Stats (use final filtered ensayos — after IA range + red filter, minus outliers)
  const statsA = useMemo(
    () => (hibridoA ? computeHybridStats(hibridoA, ensayosFiltradosFinal, outlierKeys) : null),
    [hibridoA, ensayosFiltradosFinal, outlierKeys]
  );
  const statsB = useMemo(
    () => (hibridoB ? computeHybridStats(hibridoB, ensayosFiltradosFinal, outlierKeys) : null),
    [hibridoB, ensayosFiltradosFinal, outlierKeys]
  );
  const h2hResult = useMemo(
    () => (statsA && statsB ? headToHead(statsA, statsB) : null),
    [statsA, statsB]
  );

  const statsHead = useMemo(
    () => (hibridoHead ? computeHybridStats(hibridoHead, ensayosFiltradosFinal, outlierKeys) : null),
    [hibridoHead, ensayosFiltradosFinal, outlierKeys]
  );
  const vsAllResults = useMemo((): DiffResult[] => {
    if (!statsHead) return [];
    return hibridosDisponibles
      .filter((h) => h !== hibridoHead)
      .map((h) => headToHead(statsHead, computeHybridStats(h, ensayosFiltradosFinal, outlierKeys)))
      .filter((r) => r.n > 0)
      .sort((a, b) => b.diff - a.diff);
  }, [statsHead, hibridosDisponibles, hibridoHead, ensayosFiltradosFinal, outlierKeys]);

  const entityWord = cultivo === "soja" ? "variedad" : "híbrido";
  const EntityWord = cultivo === "soja" ? "Variedad" : "Híbrido";

  const canProceed = filterMode === "mapa" ? selectedLocalidades.length > 0 : selectedRedes.length > 0;
  const toggleLocalidad = useCallback((loc: string) => {
    setSelectedLocalidades((prev) => prev.includes(loc) ? prev.filter((l) => l !== loc) : [...prev, loc]);
  }, []);

  function resetCompare() {
    setCompareMode(null); setHibridoA(""); setHibridoB(""); setHibridoHead(""); setSelectedCompany(""); setSelectedRedesComp([]);
  }
  function goStep1() {
    setStep(1); setCultivo(null); setFilterMode(null); setSelectedLocalidades([]); setSelectedRedes([]);
    resetCompare(); setEnsayos([]); setEiCuts([]);
  }
  function goStep2() {
    setStep(2); setFilterMode(null); setSelectedLocalidades([]); setSelectedRedes([]); resetCompare();
  }

  // ── Step 1: Cultivo ──────────────────────────────────────────────────────────

  if (step === 1) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center px-6" style={{ background: "#1a1a2e", minHeight: "100vh" }}>
        <div style={{ width: "100%", maxWidth: 480 }}>
          <Link href="/comparador" style={{ color: "#4a6a8a", fontSize: 13, display: "block", marginBottom: 32 }}>← Comparador</Link>
          <h1 style={{ color: "#e2b04a", fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Genética / ECR</h1>
          <p style={{ color: "#6a8ab0", fontSize: 14, marginBottom: 40 }}>¿Con qué cultivo querés trabajar?</p>
          <div style={{ display: "flex", gap: 16 }}>
            <button onClick={() => { setCultivo("maiz"); setStep(2); }} style={{ flex: 1, padding: "28px 16px", background: "#16213e", border: "2px solid #3dbb6e", borderRadius: 16, color: "#e0e0e0", fontSize: 16, fontWeight: 700, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 40 }}>🌽</span>Maíz
            </button>
            <button onClick={() => { setCultivo("soja"); setStep(2); }} style={{ flex: 1, padding: "28px 16px", background: "#16213e", border: "2px solid #3dbb6e", borderRadius: 16, color: "#e0e0e0", fontSize: 16, fontWeight: 700, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 40 }}>🌱</span>Soja
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
            <button onClick={goStep1} style={{ background: "none", border: "none", color: "#4a6a8a", cursor: "pointer", fontSize: 13 }}>← Cultivo</button>
            <span style={{ color: "#2a4060" }}>·</span>
            <span style={{ color: "#e2b04a", fontWeight: 700, fontSize: 13 }}>{cultivo === "maiz" ? "🌽 Maíz" : "🌱 Soja"}</span>
          </div>
          <h2 style={{ color: "#e0e0e0", fontSize: 20, fontWeight: 700, marginBottom: 6 }}>¿Cómo querés filtrar los ensayos?</h2>
          <p style={{ color: "#6a8ab0", fontSize: 13, marginBottom: 24 }}>{loading ? "Cargando datos…" : `${ensayos.length} ensayos disponibles`}</p>
          {error && <p style={{ color: "#e24a7a", background: "#2a0a1a", borderRadius: 8, padding: 12, marginBottom: 16 }}>{error}</p>}

          {!filterMode && (
            <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
              {(["mapa", "red"] as const).map((mode) => (
                <button key={mode} onClick={() => setFilterMode(mode)} disabled={loading} style={{ flex: 1, padding: "20px 16px", background: "#16213e", border: "2px solid #1a4a80", borderRadius: 16, color: "#aac4e0", fontSize: 15, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 8, opacity: loading ? 0.5 : 1 }}>
                  <span style={{ fontSize: 32 }}>{mode === "mapa" ? "🗺" : "📋"}</span>
                  {mode === "mapa" ? "Por mapa" : "Por red"}
                  <span style={{ fontSize: 11, color: "#4a6a8a" }}>{mode === "mapa" ? "Elegí localidades en el mapa" : "Filtrá por red de ensayos"}</span>
                </button>
              ))}
            </div>
          )}

          {filterMode === "mapa" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <button onClick={() => setFilterMode(null)} style={{ background: "none", border: "none", color: "#4a6a8a", cursor: "pointer", fontSize: 12 }}>← Cambiar modo</button>
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
                    <span key={loc} onClick={() => toggleLocalidad(loc)} style={{ background: "#16213e", border: "1px solid #e2b04a", color: "#e2b04a", borderRadius: 20, padding: "3px 10px", fontSize: 12, cursor: "pointer" }}>
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
                <button onClick={() => setFilterMode(null)} style={{ background: "none", border: "none", color: "#4a6a8a", cursor: "pointer", fontSize: 12 }}>← Cambiar modo</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {redes.map((red) => {
                  const checked = selectedRedes.includes(red);
                  const count = ensayos.filter((e) => e.red === red).length;
                  return (
                    <label key={red} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: checked ? "#16213e" : "#0f2040", border: `1px solid ${checked ? "#3dbb6e" : "#1a4a80"}`, borderRadius: 10, cursor: "pointer", color: "#aac4e0", fontSize: 14 }}>
                      <input type="checkbox" checked={checked} onChange={() => setSelectedRedes((prev) => checked ? prev.filter((r) => r !== red) : [...prev, red])} style={{ accentColor: "#3dbb6e" }} />
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
              <button onClick={() => setStep(3)} style={{ width: "100%", padding: "14px", background: "#3dbb6e", border: "none", borderRadius: 12, color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
                Ver comparación →
              </button>
            </div>
          )}
        </div>
      </main>
    );
  }

  // ── Step 3: Comparison ───────────────────────────────────────────────────────

  const filterLabel = filterMode === "mapa" ? `${selectedLocalidades.length} localidad${selectedLocalidades.length > 1 ? "es" : ""}` : selectedRedes.join(", ");
  const localidadesConIA = Object.keys(ia).filter((loc) => {
    const eIA = ia[loc];
    return eIA >= iaLow && eIA <= iaHigh;
  }).length;

  return (
    <main style={{ background: "#1a1a2e", minHeight: "100vh", padding: "16px" }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        {/* Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
          <button onClick={goStep2} style={{ background: "none", border: "none", color: "#4a6a8a", cursor: "pointer", fontSize: 13 }}>← Filtro</button>
          <span style={{ color: "#2a4060" }}>·</span>
          <span style={{ color: "#e2b04a", fontSize: 13 }}>{cultivo === "maiz" ? "🌽 Maíz" : "🌱 Soja"} · {filterLabel}</span>
        </div>

        {/* IA Slider + statistical controls (always visible in step 3) */}
        {iaAbsMin < iaAbsMax && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
            <IASlider
              iaMin={iaAbsMin} iaMax={iaAbsMax}
              iaLow={iaLow} iaHigh={iaHigh}
              iaVals={iaVals}
              localidadesConIA={localidadesConIA}
              totalLocalidades={Object.keys(ia).length}
              onChangeLow={setIaLow} onChangeHigh={setIaHigh}
              eiCuts={eiCuts}
            />
            <EiCutsEditor
              cuts={eiCuts} onChange={setEiCuts}
              iaMin={iaAbsMin} iaMax={iaAbsMax}
            />
            <OutlierControl
              enabled={outlierEnabled} threshold={outlierThreshold}
              outlierCount={outlierKeys.size}
              onChange={setOutlierEnabled}
              onChangeThreshold={setOutlierThreshold}
            />
          </div>
        )}

        {/* Mode selector */}
        {!compareMode && (
          <div>
            <h2 style={{ color: "#e0e0e0", fontSize: 18, fontWeight: 700, marginBottom: 6 }}>¿Cómo querés comparar?</h2>
            <p style={{ color: "#4a6a8a", fontSize: 13, marginBottom: 20 }}>{hibridosDisponibles.length} {entityWord}s disponibles</p>
            <div style={{ display: "flex", gap: 16 }}>
              <button onClick={() => setCompareMode("h2h")} style={{ flex: 1, padding: "22px 16px", background: "#16213e", border: "2px solid #1a4a80", borderRadius: 14, color: "#aac4e0", fontSize: 15, fontWeight: 600, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 30 }}>⚔️</span>Cabeza a cabeza
                <span style={{ fontSize: 11, color: "#4a6a8a" }}>1 vs 1 · gráfico de regresión</span>
              </button>
              <button onClick={() => setCompareMode("vs_all")} style={{ flex: 1, padding: "22px 16px", background: "#16213e", border: "2px solid #1a4a80", borderRadius: 14, color: "#aac4e0", fontSize: 15, fontWeight: 600, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 30 }}>📊</span>Uno vs varios
                <span style={{ fontSize: 11, color: "#4a6a8a" }}>Diferencias en kg contra todos</span>
              </button>
            </div>
          </div>
        )}

        {/* ── Cabeza a cabeza ────────────────────────────────────────────────── */}
        {compareMode === "h2h" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <button onClick={resetCompare} style={{ background: "none", border: "none", color: "#4a6a8a", cursor: "pointer", fontSize: 12 }}>← Cambiar modo</button>
              <span style={{ color: "#e2b04a", fontSize: 13, fontWeight: 700 }}>⚔️ Cabeza a cabeza</span>
            </div>

            <div style={{ background: "#16213e", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 14, marginBottom: 16 }}>
              <RedesFilter redes={redesDisponibles} selected={selectedRedesComp} onChange={setSelectedRedesComp} />
              <CompanyFilter companies={empresasDisponibles} selected={selectedCompany} onChange={setSelectedCompany} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }} className="h2h-selectors">
                <HybridSelect label={`${EntityWord} A`} value={hibridoA} onChange={setHibridoA} options={hibridosFiltradosPorEmpresa.filter((h) => h !== hibridoB)} color={COLOR_A} placeholder={`Buscar ${entityWord}…`} />
                <HybridSelect label={`${EntityWord} B`} value={hibridoB} onChange={setHibridoB} options={hibridosFiltradosPorEmpresa.filter((h) => h !== hibridoA)} color={COLOR_B} placeholder={`Buscar ${entityWord}…`} />
              </div>
            </div>

            {/* Difference card */}
            {h2hResult && h2hResult.n > 0 && statsA && statsB && (() => {
              const sig = sigLabel(h2hResult.pVal);
              const winner = h2hResult.diff >= 0 ? "A" : "B";
              const winnerColor = h2hResult.diff >= 0 ? COLOR_A : COLOR_B;
              return (
                <div style={{ background: "#16213e", borderRadius: 12, padding: "16px 20px", marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 160 }}>
                      <p style={{ color: "#6a8ab0", fontSize: 11, marginBottom: 4 }}>{winner} gana</p>
                      <p style={{ color: winnerColor, fontSize: 28, fontWeight: 800, lineHeight: 1 }}>
                        +{Math.abs(Math.round(h2hResult.diff)).toLocaleString("es-AR")} <span style={{ fontSize: 14, fontWeight: 400 }}>kg/ha</span>
                        {sig && <span style={{ fontSize: 16, marginLeft: 4 }}>{sig}</span>}
                      </p>
                      <p style={{ color: "#4a6a8a", fontSize: 12, marginTop: 4 }}>
                        en {h2hResult.n} localidad{h2hResult.n > 1 ? "es" : ""} en común
                      </p>
                    </div>
                    <div style={{ display: "flex", gap: 20 }}>
                      {[{ s: statsA, color: COLOR_A }, { s: statsB, color: COLOR_B }].map(({ s, color }) => (
                        <div key={s.name} style={{ textAlign: "center" }}>
                          <p style={{ fontSize: 10, color, fontWeight: 600, marginBottom: 2 }}>{s.name.length > 16 ? s.name.slice(0, 15) + "…" : s.name}</p>
                          <p style={{ fontSize: 20, fontWeight: 700, color: "#e0e0e0" }}>{Math.round(s.mean).toLocaleString("es-AR")}</p>
                          <p style={{ fontSize: 10, color: "#4a6a8a" }}>kg/ha · n={s.n}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Statistical summary row */}
                  <div style={{ display: "flex", gap: 16, marginTop: 12, paddingTop: 10, borderTop: "1px solid #0f3060", flexWrap: "wrap" }}>
                    {h2hResult.pVal !== undefined && (
                      <div>
                        <span style={{ fontSize: 10, color: "#4a6a8a" }}>p-valor </span>
                        <span style={{
                          fontSize: 12, fontWeight: 700,
                          color: h2hResult.pVal < 0.05 ? "#3dbb6e" : h2hResult.pVal < 0.10 ? "#e2b04a" : "#6a8ab0",
                        }}>
                          {h2hResult.pVal < 0.001 ? "<0.001" : h2hResult.pVal.toFixed(3)}
                          {" "}
                          {h2hResult.pVal < 0.05 ? "sig." : h2hResult.pVal < 0.10 ? "tend." : "n.s."}
                        </span>
                      </div>
                    )}
                    {h2hResult.winPct !== undefined && (
                      <div>
                        <span style={{ fontSize: 10, color: "#4a6a8a" }}>A gana en </span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: h2hResult.winPct >= 0.5 ? COLOR_A : COLOR_B }}>
                          {Math.round(h2hResult.winPct * 100)}% de las localidades
                        </span>
                      </div>
                    )}
                    {h2hResult.n < 2 && (
                      <span style={{ fontSize: 10, color: "#4a6a8a" }}>mínimo 2 localidades para test estadístico</span>
                    )}
                  </div>
                </div>
              );
            })()}

            {h2hResult && h2hResult.n === 0 && hibridoA && hibridoB && (
              <p style={{ color: "#4a6a8a", background: "#0f2040", borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13 }}>
                No hay localidades en común entre los dos {entityWord}s en la selección actual.
              </p>
            )}

            {statsA && statsB && h2hResult && h2hResult.n > 0 && (
              <div style={{ background: "#16213e", borderRadius: 12, padding: 16 }}>
                <h3 style={{ color: "#e2b04a", fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Respuesta al ambiente</h3>
                <RegressionChart sA={statsA} sB={statsB} ia={ia} />
              </div>
            )}

            {(!hibridoA || !hibridoB) && (
              <div style={{ background: "#16213e", borderRadius: 12, padding: 32, textAlign: "center", color: "#4a6a8a", fontSize: 14 }}>
                Seleccioná los dos {entityWord}s para ver la comparación.
              </div>
            )}
          </div>
        )}

        {/* ── Uno vs varios ─────────────────────────────────────────────────── */}
        {compareMode === "vs_all" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <button onClick={resetCompare} style={{ background: "none", border: "none", color: "#4a6a8a", cursor: "pointer", fontSize: 12 }}>← Cambiar modo</button>
              <span style={{ color: "#e2b04a", fontSize: 13, fontWeight: 700 }}>📊 Uno vs varios</span>
            </div>

            <div style={{ background: "#16213e", borderRadius: 12, padding: 16, display: "flex", flexDirection: "column", gap: 14, marginBottom: 16 }}>
              <RedesFilter redes={redesDisponibles} selected={selectedRedesComp} onChange={setSelectedRedesComp} />
              <CompanyFilter companies={empresasDisponibles} selected={selectedCompany} onChange={setSelectedCompany} />
              <div style={{ maxWidth: 400 }}>
                <HybridSelect label={`${EntityWord} cabeza`} value={hibridoHead} onChange={setHibridoHead} options={hibridosFiltradosPorEmpresa} color={COLOR_A} placeholder={`Buscar ${entityWord}…`} />
              </div>
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
                  <span style={{ color: "#4a6a8a", fontSize: 12 }}>{vsAllResults.length} comparaciones</span>
                </div>
                {/* Vertical bars on tablet/desktop, horizontal on mobile */}
                <div className="hidden md:block overflow-x-auto">
                  <VerticalDivergingBarChart results={vsAllResults} headName={hibridoHead} />
                </div>
                <div className="block md:hidden">
                  <DivergingBarChart results={vsAllResults} headName={hibridoHead} />
                </div>
                {vsAllResults.some((r) => r.pVal !== undefined) && (
                  <p style={{ fontSize: 10, color: "#4a6a8a", marginTop: 10 }}>
                    ** p&lt;0.05 · * p&lt;0.10 · hover sobre las barras para ver p-valor y win%
                  </p>
                )}
              </div>
            )}

            {!hibridoHead && (
              <div style={{ background: "#16213e", borderRadius: 12, padding: 32, textAlign: "center", color: "#4a6a8a", fontSize: 14 }}>
                Seleccioná el {entityWord} cabeza para ver sus comparaciones.
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        @media (max-width: 560px) { .h2h-selectors { grid-template-columns: 1fr !important; } }
      `}</style>
    </main>
  );
}
