"use client";

import Link from "next/link";
import { useState, useEffect, useMemo, useCallback } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface GrainPrice {
  key: string;
  name: string;
  ticker: string;
  price_usd_ton: number;
  prev_price_usd_ton: number;
  change_pct: number;
  history: { date: string; price_usd_ton: number }[];
}

interface PreciosData {
  granos: GrainPrice[];
  usd_ars_oficial: number;
  usd_ars_blue: number;
  updated_at: string;
  source: string;
}

interface Decision {
  id: string;
  fecha: string;
  grano: string;
  toneladas: number;
  precio_usd: number;
  estrategia: string;
  notas: string;
}

interface Inputs {
  A1: number; A2: number; A5: number; A6: number;
  B1: number; B2: number; B4: number; B5: number;
  B7: number; B8: number; B9: number; B11: number; B12: number; B13: number;
  C1: number; C3: "disponible" | "futuro"; C6: number;
  D1: number;
}

const DEFAULT_INPUTS: Inputs = {
  A1: 0, A2: 0, A5: 0, A6: 0,
  B1: 0, B2: 0, B4: 0, B5: 0, B7: 0, B8: 0, B9: 0, B11: 0, B12: 0, B13: 0,
  C1: 0, C3: "disponible", C6: 0,
  D1: 5,
};

const LS_INPUTS = "iag_analisis_inputs";
const LS_DECISIONS = "iag_decisiones";

// ── Formula engine ────────────────────────────────────────────────────────────

function calcFormulas(i: Inputs) {
  const A3 = i.A1 - i.A2;
  const A4 = i.A1 !== 0 ? (i.A2 * i.A5 + A3 * i.A6) / i.A1 : 0;
  const A7 = A4 * i.A1;
  const B3 = A7 - i.B1 - i.B2;
  const B6 = A7 - i.B2 - i.B4;
  const B10 = i.B8 - i.B9;
  const ref = i.C3 === "disponible" ? i.B11 : i.B13;

  const C2 = A4 !== 0 ? i.C1 / A4 : 0;
  const calcPrice = (r: number) =>
    A7 !== 0
      ? i.B8 > r
        ? (i.B5 * i.B2 + i.B12 * i.B4 + i.B7 * B10 + (B6 - i.B7) * r) / A7
        : (i.B5 * i.B2 + i.B12 * i.B4 + B6 * r) / A7
      : 0;

  const C4 = calcPrice(ref);
  const C5 = C4 * A4 - i.C1;
  const C7 = A4 !== 0 ? i.C1 * (1 + i.C6 / 100) / A4 : 0;

  const D1f = i.D1 / 100;
  const D2_price = calcPrice(ref * (1 - D1f));
  const D2 = D2_price * A4 - i.C1;
  const D3_price = calcPrice(ref * (1 + D1f));
  const D3 = D3_price * A4 - i.C1;

  return { A3, A4, A7, B3, B6, B10, ref, C2, C4, C5, C7, D2, D3 };
}

// ── Sparkline ─────────────────────────────────────────────────────────────────

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const W = 120, H = 36;
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * W},${H - ((v - min) / range) * (H - 4) - 2}`)
    .join(" ");
  const isUp = data[data.length - 1] >= data[data.length - 2];
  const lx = W, ly = H - ((data[data.length - 1] - min) / range) * (H - 4) - 2;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 36, display: "block" }}>
      <polyline fill="none" stroke={isUp ? "#3dbb6e" : "#e24a7a"} strokeWidth="1.8" points={pts} />
      <circle cx={lx} cy={ly} r="2.5" fill={isUp ? "#3dbb6e" : "#e24a7a"} />
    </svg>
  );
}

// ── Historical chart ──────────────────────────────────────────────────────────

function HistChart({ data }: { data: { date: string; price_usd_ton: number }[] }) {
  if (data.length < 2) return (
    <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: "#4a6a8a", fontSize: 13 }}>
      Sin datos históricos
    </div>
  );
  const W = 560, H = 220, lM = 52, rM = 16, tM = 16, bM = 32;
  const cW = W - lM - rM, cH = H - tM - bM;
  const prices = data.map((d) => d.price_usd_ton);
  const minP = Math.min(...prices), maxP = Math.max(...prices);
  const range = maxP - minP || 1;
  const tStep = Math.ceil((maxP - minP) / 5 / 10) * 10 || 10;
  const ticks = Array.from({ length: 6 }, (_, k) => Math.floor(minP / tStep) * tStep + k * tStep).filter((t) => t >= minP - tStep && t <= maxP + tStep);
  const xOf = (i: number) => lM + (i / (data.length - 1)) * cW;
  const yOf = (v: number) => tM + cH - ((v - minP) / range) * cH;
  const pts = data.map((d, i) => `${xOf(i)},${yOf(d.price_usd_ton)}`).join(" ");
  const area = `M ${xOf(0)},${yOf(data[0].price_usd_ton)} ${data.map((d, i) => `L ${xOf(i)},${yOf(d.price_usd_ton)}`).join(" ")} L ${xOf(data.length - 1)},${tM + cH} L ${xOf(0)},${tM + cH} Z`;
  const lStep = Math.max(1, Math.floor(data.length / 10));
  const lblIdxs = data.map((_, i) => i).filter((i) => i % lStep === 0 || i === data.length - 1);
  const last = data[data.length - 1];
  const peakIdx = prices.indexOf(maxP);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={lM} x2={W - rM} y1={yOf(t)} y2={yOf(t)} stroke="#1a3060" strokeDasharray="3 3" strokeWidth="1" />
          <text x={lM - 6} y={yOf(t) + 4} textAnchor="end" fontSize={10} fill="#4a6a8a">{t}</text>
        </g>
      ))}
      <line x1={lM} x2={lM} y1={tM} y2={tM + cH} stroke="#1a3060" strokeWidth="1" />
      <line x1={lM} x2={W - rM} y1={tM + cH} y2={tM + cH} stroke="#1a3060" strokeWidth="1" />
      <path d={area} fill="#3dbb6e" opacity={0.08} />
      <polyline fill="none" stroke="#3dbb6e" strokeWidth="2" points={pts} />
      {lblIdxs.map((i) => (
        <text key={i} x={xOf(i)} y={tM + cH + 18} textAnchor="middle" fontSize={10} fill="#4a6a8a">{data[i].date.slice(5)}</text>
      ))}
      <circle cx={xOf(data.length - 1)} cy={yOf(last.price_usd_ton)} r={4} fill="#e24a7a" />
      <text x={xOf(data.length - 1) - 6} y={yOf(last.price_usd_ton) - 8} textAnchor="end" fontSize={11} fill="#e24a7a" fontWeight="600">{last.price_usd_ton} USD/t</text>
      <circle cx={xOf(peakIdx)} cy={yOf(maxP)} r={3} fill="#e2b04a" />
      <text x={xOf(peakIdx) + 6} y={yOf(maxP) - 6} textAnchor="start" fontSize={11} fill="#e2b04a" fontWeight="600">máx {maxP} USD/t</text>
    </svg>
  );
}

// ── Small UI helpers ──────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 10, color: "#4a6a8a", textTransform: "uppercase" as const, letterSpacing: "0.06em", fontWeight: 700, display: "block", marginBottom: 3 }}>{label}</label>
      {children}
    </div>
  );
}

const INPUT_STYLE = { width: "100%", background: "#0a1628", border: "1px solid #1a4a80", borderRadius: 7, padding: "7px 9px", fontSize: 13, color: "#e0e0e0", fontFamily: "inherit", outline: "none" };

function NumInput({ value, onChange, step = 1, min = 0 }: { value: number; onChange: (v: number) => void; step?: number; min?: number }) {
  return (
    <input type="number" value={value || ""} step={step} min={min} placeholder="0"
      onChange={(e) => onChange(Number(e.target.value) || 0)}
      style={INPUT_STYLE} />
  );
}

function CalcRow({ label, value, unit, accent = "#3dbb6e" }: { label: string; value: number; unit?: string; accent?: string }) {
  const v = !isFinite(value) || isNaN(value) ? "—" : value.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 9px", background: "#060f1e", borderRadius: 7, borderLeft: `3px solid ${accent}` }}>
      <span style={{ fontSize: 11, color: "#6a8ab0" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: accent }}>{v}{unit ? ` ${unit}` : ""}</span>
    </div>
  );
}

function SecLabel({ letter, title }: { letter: string; title: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
      <span style={{ background: "#e2b04a", color: "#0f1a2e", borderRadius: 6, width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 14, flexShrink: 0 }}>{letter}</span>
      <span style={{ color: "#e0e0e0", fontWeight: 700, fontSize: 14 }}>{title}</span>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AnalisisComercialPage() {
  const [tab, setTab] = useState<"analisis" | "decisiones">("analisis");
  const [data, setData] = useState<PreciosData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeGrain, setActiveGrain] = useState("soja");
  const [showHist, setShowHist] = useState(false);
  const [inputs, setInputs] = useState<Inputs>(DEFAULT_INPUTS);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [decForm, setDecForm] = useState({
    grano: "soja", toneladas: 0, precio_usd: 0,
    estrategia: "disponible",
    fecha: new Date().toISOString().slice(0, 10),
    notas: "",
  });

  useEffect(() => {
    try {
      const s = localStorage.getItem(LS_INPUTS);
      if (s) setInputs({ ...DEFAULT_INPUTS, ...JSON.parse(s) });
      const d = localStorage.getItem(LS_DECISIONS);
      if (d) setDecisions(JSON.parse(d));
    } catch {}
  }, []);

  useEffect(() => { localStorage.setItem(LS_INPUTS, JSON.stringify(inputs)); }, [inputs]);
  useEffect(() => { localStorage.setItem(LS_DECISIONS, JSON.stringify(decisions)); }, [decisions]);

  useEffect(() => {
    fetch("/api/precios-granos")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d);
        const soja = d.granos.find((g: GrainPrice) => g.key === "soja");
        if (soja) {
          setInputs((prev) => ({
            ...prev,
            B11: prev.B11 || soja.price_usd_ton,
            B13: prev.B13 || soja.price_usd_ton,
            A6: prev.A6 || soja.price_usd_ton,
          }));
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const setInp = useCallback(<K extends keyof Inputs>(key: K, val: Inputs[K]) => {
    setInputs((prev) => ({ ...prev, [key]: val }));
  }, []);

  const activeGrainData = useMemo(() => data?.granos.find((g) => g.key === activeGrain), [data, activeGrain]);
  const calc = useMemo(() => calcFormulas(inputs), [inputs]);

  function addDecision() {
    if (!decForm.toneladas || !decForm.precio_usd) return;
    setDecisions((prev) => [{ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ...decForm }, ...prev]);
    setDecForm((f) => ({ ...f, toneladas: 0, precio_usd: 0, notas: "" }));
  }

  return (
    <main style={{ background: "#1a1a2e", minHeight: "100vh", padding: "20px 16px" }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>

        {/* Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
          <Link href="/analisis" style={{ color: "#4a6a8a", fontSize: 13 }}>← Análisis</Link>
          <span style={{ color: "#2a4060" }}>·</span>
          <span style={{ color: "#e2b04a", fontSize: 13, fontWeight: 700 }}>📈 Comercialización de granos</span>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 2, marginBottom: 24, borderBottom: "1px solid #1a3060" }}>
          {(["analisis", "decisiones"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} style={{
              border: "none", background: "none", padding: "10px 20px", fontSize: 13, fontWeight: 700,
              color: tab === t ? "#e2b04a" : "#4a6a8a", cursor: "pointer",
              borderBottom: tab === t ? "2px solid #e2b04a" : "2px solid transparent", marginBottom: -1,
            }}>
              {t === "analisis" ? "📊 Análisis" : "📋 Decisiones"}
            </button>
          ))}
        </div>

        {/* ══ TAB ANÁLISIS ══════════════════════════════════════════════════════ */}
        {tab === "analisis" && (
          <>
            {loading && <div style={{ textAlign: "center", padding: "40px 0", color: "#6a8ab0", fontSize: 14 }}>Cargando cotizaciones…</div>}
            {error && <div style={{ background: "#2a0a1a", border: "1px solid #6a1a2a", borderRadius: 10, padding: "12px 16px", color: "#e24a7a", fontSize: 13, marginBottom: 20 }}>No se pudieron cargar los datos de mercado: {error}</div>}

            {/* Cotizaciones */}
            {data && (
              <section style={{ marginBottom: 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                  <h2 style={{ color: "#e0e0e0", fontSize: 15, fontWeight: 700, margin: 0 }}>Cotizaciones</h2>
                  <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 11, color: "#4a6a8a" }}>TC oficial: <strong style={{ color: "#aac4e0" }}>${data.usd_ars_oficial.toLocaleString("es-AR")}</strong></span>
                    <span style={{ fontSize: 11, color: "#4a6a8a" }}>TC blue: <strong style={{ color: "#e2b04a" }}>${data.usd_ars_blue.toLocaleString("es-AR")}</strong></span>
                    <span style={{ fontSize: 11, color: "#2a4060" }}>{new Date(data.updated_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 10 }}>
                  {data.granos.map((g) => {
                    const isUp = g.change_pct >= 0;
                    return (
                      <div key={g.key} onClick={() => setActiveGrain(g.key)} style={{ background: "#16213e", border: `1px solid ${activeGrain === g.key ? "#3dbb6e" : "#1a4a80"}`, borderRadius: 10, padding: "11px 13px", cursor: "pointer" }}>
                        <div style={{ fontSize: 10, color: "#6a8ab0", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{g.name}</div>
                        <div style={{ fontSize: 21, fontWeight: 800, color: "#e2b04a" }}>US$ {g.price_usd_ton}</div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: isUp ? "#3dbb6e" : "#e24a7a", marginTop: 2 }}>{isUp ? "▲" : "▼"} {isUp ? "+" : ""}{g.change_pct}%</div>
                        <div style={{ marginTop: 6 }}><Sparkline data={g.history.slice(-12).map((h) => h.price_usd_ton)} /></div>
                      </div>
                    );
                  })}
                </div>
                <button onClick={() => setShowHist((v) => !v)} style={{ background: "none", border: "none", color: "#4a6a8a", fontSize: 12, cursor: "pointer", marginTop: 10, padding: "4px 0" }}>
                  {showHist ? "▲ Ocultar evolución" : "▼ Ver evolución histórica · 12 meses"}
                </button>
                {showHist && (
                  <div style={{ background: "#16213e", border: "1px solid #1a4a80", borderRadius: 12, padding: "14px", marginTop: 8 }}>
                    <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                      {data.granos.map((g) => (
                        <button key={g.key} onClick={() => setActiveGrain(g.key)} style={{ border: "1px solid", borderColor: activeGrain === g.key ? "#3dbb6e" : "#1a4a80", background: activeGrain === g.key ? "#0f3a1a" : "#0f2040", color: activeGrain === g.key ? "#3dbb6e" : "#6a8ab0", borderRadius: 999, padding: "4px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>{g.name}</button>
                      ))}
                    </div>
                    <div style={{ background: "#0f1a2e", borderRadius: 10, padding: "10px 6px", overflowX: "auto" }}>
                      {activeGrainData && <HistChart data={activeGrainData.history} />}
                    </div>
                  </div>
                )}
              </section>
            )}

            {/* Mi posición */}
            <section style={{ background: "#16213e", border: "1px solid #1a4a80", borderRadius: 14, padding: "18px 18px 22px", marginBottom: 16 }}>
              <h2 style={{ color: "#e0e0e0", fontSize: 15, fontWeight: 700, margin: "0 0 18px" }}>Mi posición</h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                {/* A */}
                <div style={{ background: "#0f1a2e", borderRadius: 11, padding: "14px" }}>
                  <SecLabel letter="A" title="Stock físico" />
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <Field label="A1 · Stock total (t)"><NumInput value={inputs.A1} onChange={(v) => setInp("A1", v)} /></Field>
                    <Field label="A2 · Ya vendido (t)"><NumInput value={inputs.A2} onChange={(v) => setInp("A2", v)} /></Field>
                    <CalcRow label="A3 · Disponible (t)" value={calc.A3} unit="t" />
                    <Field label="A5 · Precio ya vendido (USD/t)"><NumInput value={inputs.A5} onChange={(v) => setInp("A5", v)} step={0.5} /></Field>
                    <Field label="A6 · Precio disponible hoy (USD/t)"><NumInput value={inputs.A6} onChange={(v) => setInp("A6", v)} step={0.5} /></Field>
                    <CalcRow label="A4 · Precio promedio ponderado" value={calc.A4} unit="USD/t" accent="#e2b04a" />
                    <CalcRow label="A7 · Valor total del stock" value={calc.A7} unit="USD" accent="#3b6ba1" />
                  </div>
                </div>

                {/* B */}
                <div style={{ background: "#0f1a2e", borderRadius: 11, padding: "14px" }}>
                  <SecLabel letter="B" title="Coberturas" />
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <Field label="B1 · Vendido c/precio (USD)"><NumInput value={inputs.B1} onChange={(v) => setInp("B1", v)} /></Field>
                    <Field label="B2 · A fijar (USD)"><NumInput value={inputs.B2} onChange={(v) => setInp("B2", v)} /></Field>
                    <CalcRow label="B3 · Restante sin vender (USD)" value={calc.B3} />
                    <Field label="B4 · Cubierto c/PUT (USD)"><NumInput value={inputs.B4} onChange={(v) => setInp("B4", v)} /></Field>
                    <Field label="B5 · Precio PUT (USD/t)"><NumInput value={inputs.B5} onChange={(v) => setInp("B5", v)} step={0.5} /></Field>
                    <CalcRow label="B6 · Sin cubrir (USD)" value={calc.B6} accent="#e24a7a" />
                    <Field label="B7 · Precio forward (USD/t)"><NumInput value={inputs.B7} onChange={(v) => setInp("B7", v)} step={0.5} /></Field>
                    <Field label="B8 · Precio disponible Rosario (USD/t)"><NumInput value={inputs.B8} onChange={(v) => setInp("B8", v)} step={0.5} /></Field>
                    <Field label="B9 · Prima PUT (USD/t)"><NumInput value={inputs.B9} onChange={(v) => setInp("B9", v)} step={0.5} /></Field>
                    <CalcRow label="B10 · Resultado opción (USD/t)" value={calc.B10} unit="USD/t" />
                    <Field label="B11 · Disponible Rosario referencia (USD/t)"><NumInput value={inputs.B11} onChange={(v) => setInp("B11", v)} step={0.5} /></Field>
                    <Field label="B12 · Precio a término (USD/t)"><NumInput value={inputs.B12} onChange={(v) => setInp("B12", v)} step={0.5} /></Field>
                    <Field label="B13 · Futuro Rosario referencia (USD/t)"><NumInput value={inputs.B13} onChange={(v) => setInp("B13", v)} step={0.5} /></Field>
                  </div>
                </div>

                {/* C */}
                <div style={{ background: "#0f1a2e", borderRadius: 11, padding: "14px" }}>
                  <SecLabel letter="C" title="Escenario base" />
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <Field label="C3 · Referencia de precio">
                      <div style={{ display: "flex", gap: 6, marginTop: 3 }}>
                        {(["disponible", "futuro"] as const).map((opt) => (
                          <button key={opt} onClick={() => setInp("C3", opt)} style={{ flex: 1, border: "1px solid", borderColor: inputs.C3 === opt ? "#3dbb6e" : "#1a4a80", background: inputs.C3 === opt ? "#0f3a1a" : "#0a1628", color: inputs.C3 === opt ? "#3dbb6e" : "#6a8ab0", borderRadius: 7, padding: "7px 4px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                            {opt === "disponible" ? "Disponible (B11)" : "Futuro (B13)"}
                          </button>
                        ))}
                      </div>
                    </Field>
                    <div style={{ fontSize: 11, color: "#4a6a8a" }}>
                      Ref activa: <strong style={{ color: "#aac4e0" }}>{calc.ref.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD/t</strong>
                    </div>
                    <Field label="C1 · Inversión / costo total (USD)"><NumInput value={inputs.C1} onChange={(v) => setInp("C1", v)} /></Field>
                    <CalcRow label="C2 · Costo por tonelada" value={calc.C2} unit="USD/t" />
                    <CalcRow label="C4 · Precio base resultante" value={calc.C4} unit="USD/t" accent="#e2b04a" />
                    <CalcRow label="C5 · Resultado neto" value={calc.C5} unit="USD" accent={calc.C5 >= 0 ? "#3dbb6e" : "#e24a7a"} />
                    <Field label="C6 · Variación esperada (%)"><NumInput value={inputs.C6} onChange={(v) => setInp("C6", v)} step={0.5} min={-100} /></Field>
                    <CalcRow label="C7 · Precio objetivo ajustado" value={calc.C7} unit="USD/t" />
                  </div>
                </div>

                {/* D */}
                <div style={{ background: "#0f1a2e", borderRadius: 11, padding: "14px" }}>
                  <SecLabel letter="D" title="Sensibilidad" />
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <Field label="D1 · Variación de referencia (%)"><NumInput value={inputs.D1} onChange={(v) => setInp("D1", v)} step={1} /></Field>
                    <div style={{ fontSize: 11, color: "#4a6a8a" }}>
                      Ref −{inputs.D1}%: <strong style={{ color: "#e24a7a" }}>{(calc.ref * (1 - inputs.D1 / 100)).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD/t</strong>
                      {"  ·  "}
                      Ref +{inputs.D1}%: <strong style={{ color: "#3dbb6e" }}>{(calc.ref * (1 + inputs.D1 / 100)).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD/t</strong>
                    </div>
                    <CalcRow label={`D2 · Resultado si ref −${inputs.D1}%`} value={calc.D2} unit="USD" accent="#e24a7a" />
                    <CalcRow label={`D3 · Resultado si ref +${inputs.D1}%`} value={calc.D3} unit="USD" accent="#3dbb6e" />
                    {isFinite(calc.D2) && isFinite(calc.D3) && calc.D2 !== calc.D3 && (() => {
                      const lo = Math.min(calc.D2, calc.D3, calc.C5);
                      const hi = Math.max(calc.D2, calc.D3, calc.C5);
                      const rng = hi - lo || 1;
                      const pD2 = ((calc.D2 - lo) / rng) * 100;
                      const pD3 = ((calc.D3 - lo) / rng) * 100;
                      const pC5 = ((calc.C5 - lo) / rng) * 100;
                      const barL = Math.min(pD2, pD3), barW = Math.abs(pD3 - pD2);
                      return (
                        <div style={{ marginTop: 4 }}>
                          <div style={{ fontSize: 10, color: "#4a6a8a", marginBottom: 5 }}>Rango de resultado</div>
                          <div style={{ position: "relative", height: 22, background: "#060f1e", borderRadius: 11 }}>
                            <div style={{ position: "absolute", left: `${barL}%`, width: `${barW}%`, top: 5, height: 12, background: "#1a4a80", borderRadius: 6 }} />
                            <div style={{ position: "absolute", left: `${pC5}%`, top: 2, transform: "translateX(-50%)", width: 4, height: 18, background: "#e2b04a", borderRadius: 2 }} />
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#4a6a8a", marginTop: 4 }}>
                            <span>{calc.D2.toLocaleString("es-AR", { maximumFractionDigits: 0 })}</span>
                            <span style={{ color: "#e2b04a" }}>Base: {calc.C5.toLocaleString("es-AR", { maximumFractionDigits: 0 })}</span>
                            <span>{calc.D3.toLocaleString("es-AR", { maximumFractionDigits: 0 })}</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>

              </div>
            </section>

            {data && (
              <div style={{ fontSize: 11, color: "#2a4060", textAlign: "center", paddingTop: 4 }}>
                Fuente: {data.source} · {new Date(data.updated_at).toLocaleString("es-AR")}
              </div>
            )}
          </>
        )}

        {/* ══ TAB DECISIONES ════════════════════════════════════════════════════ */}
        {tab === "decisiones" && (
          <div>
            <section style={{ background: "#16213e", border: "1px solid #1a4a80", borderRadius: 14, padding: "18px", marginBottom: 18 }}>
              <h2 style={{ color: "#e0e0e0", fontSize: 15, fontWeight: 700, margin: "0 0 14px" }}>Registrar decisión</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(155px, 1fr))", gap: 10 }}>
                <Field label="Fecha">
                  <input type="date" value={decForm.fecha} onChange={(e) => setDecForm((f) => ({ ...f, fecha: e.target.value }))} style={INPUT_STYLE} />
                </Field>
                <Field label="Grano">
                  <select value={decForm.grano} onChange={(e) => setDecForm((f) => ({ ...f, grano: e.target.value }))} style={INPUT_STYLE}>
                    {["soja", "maiz", "trigo", "girasol", "sorgo"].map((g) => (
                      <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Toneladas">
                  <NumInput value={decForm.toneladas} onChange={(v) => setDecForm((f) => ({ ...f, toneladas: v }))} step={10} />
                </Field>
                <Field label="Precio (USD/t)">
                  <NumInput value={decForm.precio_usd} onChange={(v) => setDecForm((f) => ({ ...f, precio_usd: v }))} step={0.5} />
                </Field>
                <Field label="Estrategia">
                  <select value={decForm.estrategia} onChange={(e) => setDecForm((f) => ({ ...f, estrategia: e.target.value }))} style={INPUT_STYLE}>
                    {["disponible", "forward", "futuro", "put", "call"].map((e) => (
                      <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Notas">
                  <input type="text" value={decForm.notas} onChange={(e) => setDecForm((f) => ({ ...f, notas: e.target.value }))} placeholder="Opcional" style={INPUT_STYLE} />
                </Field>
              </div>
              <button onClick={addDecision} style={{ marginTop: 14, background: "#3dbb6e", border: "none", borderRadius: 8, padding: "9px 22px", color: "#0f1a2e", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>
                + Agregar decisión
              </button>
            </section>

            {decisions.length === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: "#4a6a8a", fontSize: 13 }}>
                Todavía no registraste ninguna decisión.
              </div>
            ) : (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {decisions.map((d) => {
                    const colors: Record<string, string> = { disponible: "#3dbb6e", forward: "#3b6ba1", futuro: "#e2b04a", put: "#e24a7a", call: "#9b6ae2" };
                    const color = colors[d.estrategia] ?? "#6a8ab0";
                    return (
                      <div key={d.id} style={{ background: "#16213e", border: "1px solid #1a4a80", borderLeft: `4px solid ${color}`, borderRadius: 12, padding: "13px 15px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 4 }}>
                            <span style={{ fontSize: 13, fontWeight: 700, color: "#e0e0e0" }}>{d.grano.charAt(0).toUpperCase() + d.grano.slice(1)} · {d.toneladas.toLocaleString("es-AR")} t</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: "#e2b04a" }}>US$ {d.precio_usd.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/t</span>
                            <span style={{ fontSize: 11, background: color + "22", color, borderRadius: 999, padding: "2px 8px", fontWeight: 700 }}>{d.estrategia}</span>
                          </div>
                          <div style={{ display: "flex", gap: 10, fontSize: 11, color: "#4a6a8a", flexWrap: "wrap" }}>
                            <span>{new Date(d.fecha + "T00:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" })}</span>
                            {d.notas && <span style={{ color: "#6a8ab0" }}>· {d.notas}</span>}
                            <span>Total: US$ {(d.toneladas * d.precio_usd).toLocaleString("es-AR", { maximumFractionDigits: 0 })}</span>
                          </div>
                        </div>
                        <button onClick={() => setDecisions((prev) => prev.filter((x) => x.id !== d.id))} style={{ background: "none", border: "none", color: "#2a4060", fontSize: 15, cursor: "pointer", flexShrink: 0, padding: "2px 4px" }}>✕</button>
                      </div>
                    );
                  })}
                </div>
                <div style={{ background: "#0f1a2e", border: "1px solid #1a3060", borderRadius: 10, padding: "12px 16px", marginTop: 10 }}>
                  <div style={{ fontSize: 10, color: "#4a6a8a", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Resumen</div>
                  <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 11, color: "#4a6a8a" }}>Total toneladas</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: "#aac4e0" }}>{decisions.reduce((s, d) => s + d.toneladas, 0).toLocaleString("es-AR")} t</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "#4a6a8a" }}>Precio prom. ponderado</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: "#e2b04a" }}>
                        US$ {(() => {
                          const tT = decisions.reduce((s, d) => s + d.toneladas, 0);
                          return tT ? (decisions.reduce((s, d) => s + d.precio_usd * d.toneladas, 0) / tT).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";
                        })()}/t
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: "#4a6a8a" }}>Valor total</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: "#3dbb6e" }}>US$ {decisions.reduce((s, d) => s + d.toneladas * d.precio_usd, 0).toLocaleString("es-AR", { maximumFractionDigits: 0 })}</div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

      </div>
    </main>
  );
}
