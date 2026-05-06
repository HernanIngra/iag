"use client";

import Link from "next/link";
import { useState, useEffect, useMemo } from "react";

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

// ── Payoff helpers ────────────────────────────────────────────────────────────

function putPayoff(spot: number, strike: number, premium: number): number {
  return Math.max(0, strike - spot) - premium;
}
function forwardPayoff(spot: number, fwdPrice: number): number {
  return fwdPrice - spot; // net gain vs. selling at spot
}
function futurePayoff(spot: number, futPrice: number): number {
  return futPrice - spot;
}
function callPayoff(spot: number, strike: number, premium: number): number {
  return Math.max(0, spot - strike) - premium; // selling a call
}

// ── Sparkline ─────────────────────────────────────────────────────────────────

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const W = 120, H = 36;
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * W;
      const y = H - ((v - min) / range) * (H - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");
  const last = data[data.length - 1];
  const isUp = last >= data[data.length - 2];
  const lastX = W;
  const lastY = H - ((last - min) / range) * (H - 4) - 2;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 36, display: "block" }}>
      <polyline fill="none" stroke={isUp ? "#3dbb6e" : "#e24a7a"} strokeWidth="1.8" points={pts} />
      <circle cx={lastX} cy={lastY} r="2.5" fill={isUp ? "#3dbb6e" : "#e24a7a"} />
    </svg>
  );
}

// ── Historical chart ──────────────────────────────────────────────────────────

function HistChart({ data }: { data: { date: string; price_usd_ton: number }[] }) {
  if (data.length < 2) {
    return (
      <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: "#4a6a8a", fontSize: 13 }}>
        Sin datos históricos
      </div>
    );
  }
  const W = 560, H = 220;
  const leftM = 52, rightM = 16, topM = 16, botM = 32;
  const chartW = W - leftM - rightM;
  const chartH = H - topM - botM;

  const prices = data.map((d) => d.price_usd_ton);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const range = maxP - minP || 1;

  const TICKS = 5;
  const tickStep = Math.ceil((maxP - minP) / TICKS / 10) * 10 || 10;
  const tickMin = Math.floor(minP / tickStep) * tickStep;
  const ticks = Array.from({ length: TICKS + 1 }, (_, i) => tickMin + i * tickStep).filter(
    (t) => t >= minP - tickStep && t <= maxP + tickStep
  );

  function xOf(i: number) {
    return leftM + (i / (data.length - 1)) * chartW;
  }
  function yOf(v: number) {
    return topM + chartH - ((v - minP) / range) * chartH;
  }

  const pts = data.map((d, i) => `${xOf(i)},${yOf(d.price_usd_ton)}`).join(" ");
  const areaPath = `M ${xOf(0)},${yOf(data[0].price_usd_ton)} ${data
    .map((d, i) => `L ${xOf(i)},${yOf(d.price_usd_ton)}`)
    .join(" ")} L ${xOf(data.length - 1)},${topM + chartH} L ${xOf(0)},${topM + chartH} Z`;

  // Show ~12 labels, evenly spaced
  const labelStep = Math.max(1, Math.floor(data.length / 10));
  const labelIdxs = data
    .map((_, i) => i)
    .filter((i) => i % labelStep === 0 || i === data.length - 1);

  const lastPt = data[data.length - 1];
  const peakIdx = prices.indexOf(maxP);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
      {/* Grid */}
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={leftM} x2={W - rightM}
            y1={yOf(t)} y2={yOf(t)}
            stroke="#1a3060" strokeDasharray="3 3" strokeWidth="1"
          />
          <text x={leftM - 6} y={yOf(t) + 4} textAnchor="end" fontSize={10} fill="#4a6a8a">
            {t}
          </text>
        </g>
      ))}
      {/* Axes */}
      <line x1={leftM} x2={leftM} y1={topM} y2={topM + chartH} stroke="#1a3060" strokeWidth="1" />
      <line x1={leftM} x2={W - rightM} y1={topM + chartH} y2={topM + chartH} stroke="#1a3060" strokeWidth="1" />
      {/* Area */}
      <path d={areaPath} fill="#3dbb6e" opacity={0.08} />
      {/* Line */}
      <polyline fill="none" stroke="#3dbb6e" strokeWidth="2" points={pts} />
      {/* X labels */}
      {labelIdxs.map((i) => (
        <text key={i} x={xOf(i)} y={topM + chartH + 18} textAnchor="middle" fontSize={10} fill="#4a6a8a">
          {data[i].date.slice(5)}
        </text>
      ))}
      {/* Last point */}
      <circle cx={xOf(data.length - 1)} cy={yOf(lastPt.price_usd_ton)} r={4} fill="#e24a7a" />
      <text
        x={xOf(data.length - 1) - 6}
        y={yOf(lastPt.price_usd_ton) - 8}
        textAnchor="end"
        fontSize={11}
        fill="#e24a7a"
        fontWeight="600"
      >
        {lastPt.price_usd_ton} USD/t
      </text>
      {/* Peak point */}
      <circle cx={xOf(peakIdx)} cy={yOf(maxP)} r={3} fill="#e2b04a" />
      <text
        x={xOf(peakIdx) + 6}
        y={yOf(maxP) - 6}
        textAnchor="start"
        fontSize={11}
        fill="#e2b04a"
        fontWeight="600"
      >
        máx {maxP} USD/t
      </text>
      {/* Y axis label */}
      <text
        x={12} y={topM + chartH / 2}
        textAnchor="middle"
        fontSize={10}
        fill="#4a6a8a"
        transform={`rotate(-90 12 ${topM + chartH / 2})`}
      >
        USD / tonelada
      </text>
    </svg>
  );
}

// ── Payoff chart ───────────────────────────────────────────────────────────────

function PayoffChart({
  strategy,
  strike,
  premium,
  currentPrice,
}: {
  strategy: string;
  strike: number;
  premium: number;
  currentPrice: number;
}) {
  const W = 480, H = 200;
  const leftM = 48, rightM = 16, topM = 16, botM = 32;
  const chartW = W - leftM - rightM;
  const chartH = H - topM - botM;

  const minSpot = Math.max(0, strike * 0.6);
  const maxSpot = strike * 1.4;
  const STEPS = 60;

  const spots = Array.from({ length: STEPS + 1 }, (_, i) => minSpot + (i / STEPS) * (maxSpot - minSpot));
  const payoffs = spots.map((s) => {
    if (strategy === "put") return putPayoff(s, strike, premium);
    if (strategy === "forward") return forwardPayoff(s, strike);
    if (strategy === "futuro") return futurePayoff(s, strike);
    if (strategy === "call") return callPayoff(s, strike, premium);
    return 0;
  });

  const maxPayoff = Math.max(...payoffs, premium * 2);
  const minPayoff = Math.min(...payoffs, -premium * 2);
  const payRange = maxPayoff - minPayoff || 1;

  function xOf(s: number) {
    return leftM + ((s - minSpot) / (maxSpot - minSpot)) * chartW;
  }
  function yOf(p: number) {
    return topM + chartH - ((p - minPayoff) / payRange) * chartH;
  }

  const pts = spots.map((s, i) => `${xOf(s)},${yOf(payoffs[i])}`).join(" ");
  const zeroY = yOf(0);
  const strikeX = xOf(strike);
  const currentX = xOf(currentPrice);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
      {/* Zero line */}
      <line x1={leftM} x2={W - rightM} y1={zeroY} y2={zeroY} stroke="#1a4a80" strokeWidth="1" strokeDasharray="4 3" />
      <text x={leftM - 4} y={zeroY + 4} textAnchor="end" fontSize={10} fill="#4a6a8a">0</text>
      {/* Strike line */}
      <line x1={strikeX} x2={strikeX} y1={topM} y2={topM + chartH} stroke="#e2b04a" strokeWidth="1" strokeDasharray="3 3" />
      <text x={strikeX} y={topM + chartH + 18} textAnchor="middle" fontSize={10} fill="#e2b04a">Strike</text>
      {/* Current price */}
      <line x1={currentX} x2={currentX} y1={topM} y2={topM + chartH} stroke="#aac4e0" strokeWidth="1" strokeDasharray="2 3" />
      <text x={currentX} y={topM - 2} textAnchor="middle" fontSize={10} fill="#aac4e0">Precio hoy</text>
      {/* Payoff curve */}
      <polyline fill="none" stroke="#3dbb6e" strokeWidth="2" points={pts} />
      {/* Axes */}
      <line x1={leftM} x2={leftM} y1={topM} y2={topM + chartH} stroke="#1a3060" strokeWidth="1" />
      <line x1={leftM} x2={W - rightM} y1={topM + chartH} y2={topM + chartH} stroke="#1a3060" strokeWidth="1" />
      {/* X labels */}
      {[minSpot, strike, maxSpot].map((s) => (
        <text key={s} x={xOf(s)} y={topM + chartH + 18} textAnchor="middle" fontSize={10} fill="#4a6a8a">
          {Math.round(s)}
        </text>
      ))}
      {/* Y labels */}
      {[minPayoff, 0, maxPayoff].map((p) => (
        <text key={p} x={leftM - 4} y={yOf(p) + 4} textAnchor="end" fontSize={10} fill="#4a6a8a">
          {Math.round(p)}
        </text>
      ))}
    </svg>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const ESTRATEGIAS = [
  { key: "put", label: "PUT" },
  { key: "call", label: "CALL" },
  { key: "forward", label: "Forward" },
  { key: "futuro", label: "Futuro" },
];

export default function AnalisisComercialPage() {
  const [data, setData] = useState<PreciosData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeGrain, setActiveGrain] = useState("soja");
  const [strategy, setStrategy] = useState("put");
  const [strike, setStrike] = useState(305);
  const [premium, setPremium] = useState(11);
  const [qty, setQty] = useState(100);

  useEffect(() => {
    fetch("/api/precios-granos")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const activeGrainData = useMemo(
    () => data?.granos.find((g) => g.key === activeGrain),
    [data, activeGrain]
  );

  const currentPrice = activeGrainData?.price_usd_ton ?? strike;

  return (
    <main style={{ background: "#1a1a2e", minHeight: "100vh", padding: "20px 16px" }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        {/* Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
          <Link href="/analisis" style={{ color: "#4a6a8a", fontSize: 13 }}>← Análisis</Link>
          <span style={{ color: "#2a4060" }}>·</span>
          <span style={{ color: "#e2b04a", fontSize: 13, fontWeight: 700 }}>📈 Comercialización de granos</span>
        </div>

        {/* Loading / Error */}
        {loading && (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#6a8ab0", fontSize: 14 }}>
            Cargando cotizaciones…
          </div>
        )}
        {error && (
          <div style={{ background: "#2a0a1a", border: "1px solid #6a1a2a", borderRadius: 10, padding: "12px 16px", color: "#e24a7a", fontSize: 13, marginBottom: 20 }}>
            No se pudieron cargar los datos de mercado: {error}
          </div>
        )}

        {/* ── Cotizaciones ─── */}
        {data && (
          <>
            <section style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
                <h2 style={{ color: "#e0e0e0", fontSize: 18, fontWeight: 700, margin: 0 }}>Cotizaciones</h2>
                <span style={{ fontSize: 11, color: "#2a4060" }}>
                  CBOT · USD/t · {new Date(data.updated_at).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              {/* TC */}
              <div style={{ display: "flex", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, color: "#4a6a8a" }}>
                  TC oficial: <strong style={{ color: "#aac4e0" }}>${data.usd_ars_oficial.toLocaleString("es-AR")}</strong>
                </span>
                <span style={{ fontSize: 12, color: "#4a6a8a" }}>
                  TC blue: <strong style={{ color: "#e2b04a" }}>${data.usd_ars_blue.toLocaleString("es-AR")}</strong>
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
                {data.granos.map((g) => {
                  const isUp = g.change_pct >= 0;
                  const sparkPrices = g.history.slice(-12).map((h) => h.price_usd_ton);
                  return (
                    <div
                      key={g.key}
                      style={{
                        background: "#16213e",
                        border: `1px solid ${activeGrain === g.key ? "#3dbb6e" : "#1a4a80"}`,
                        borderRadius: 12,
                        padding: "14px 16px",
                        cursor: "pointer",
                      }}
                      onClick={() => setActiveGrain(g.key)}
                    >
                      <div style={{ fontSize: 11, color: "#6a8ab0", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>
                        {g.name}
                      </div>
                      <div style={{ fontSize: 24, fontWeight: 800, color: "#e2b04a", letterSpacing: "-0.01em" }}>
                        US$ {g.price_usd_ton}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: isUp ? "#3dbb6e" : "#e24a7a", marginTop: 2 }}>
                        {isUp ? "▲" : "▼"} {isUp ? "+" : ""}{g.change_pct}% vs semana ant.
                      </div>
                      <div style={{ marginTop: 8 }}>
                        <Sparkline data={sparkPrices} />
                      </div>
                      <div style={{ fontSize: 11, color: "#2a4060", marginTop: 6, borderTop: "1px dashed #1a3060", paddingTop: 6 }}>
                        {g.ticker} · CBOT referencia
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* ── Histórico ─── */}
            <section
              style={{ background: "#16213e", border: "1px solid #1a4a80", borderRadius: 14, padding: "20px 22px", marginBottom: 24 }}
            >
              <h2 style={{ color: "#e0e0e0", fontSize: 18, fontWeight: 700, margin: "0 0 4px" }}>
                Evolución · 12 meses
              </h2>
              <div style={{ fontSize: 12, color: "#4a6a8a", marginBottom: 14 }}>
                Precio semanal CBOT · USD/t
              </div>
              {/* Grain tabs */}
              <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
                {data.granos.map((g) => (
                  <button
                    key={g.key}
                    onClick={() => setActiveGrain(g.key)}
                    style={{
                      border: "1px solid",
                      borderColor: activeGrain === g.key ? "#3dbb6e" : "#1a4a80",
                      background: activeGrain === g.key ? "#0f3a1a" : "#0f2040",
                      color: activeGrain === g.key ? "#3dbb6e" : "#6a8ab0",
                      borderRadius: 999,
                      padding: "6px 16px",
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {g.name}
                  </button>
                ))}
              </div>
              <div style={{ background: "#0f1a2e", borderRadius: 10, padding: "14px 8px", overflowX: "auto" }}>
                {activeGrainData && <HistChart data={activeGrainData.history} />}
              </div>
            </section>

            {/* ── Mi posición (static placeholder) ─── */}
            <section
              style={{ background: "#16213e", border: "1px solid #1a4a80", borderRadius: 14, padding: "20px 22px", marginBottom: 24 }}
            >
              <h2 style={{ color: "#e0e0e0", fontSize: 18, fontWeight: 700, margin: "0 0 4px" }}>Mi posición</h2>
              <div style={{ fontSize: 12, color: "#4a6a8a", marginBottom: 16 }}>
                Soja 25/26 · Ingresá tus datos para calcular tu exposición
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 12 }}>
                {[
                  { label: "Stock físico", val: "—", sub: "t en silo bolsa", accent: "#3dbb6e" },
                  { label: "Vendido forward", val: "—", sub: "t", accent: "#3b6ba1" },
                  { label: "Cubierto c/ futuros", val: "—", sub: "t", accent: "#e2b04a" },
                  { label: "Cubierto c/ opciones", val: "—", sub: "t", accent: "#e24a7a" },
                ].map((item) => (
                  <div
                    key={item.label}
                    style={{
                      background: "#0f2040",
                      border: "1px solid #1a4a80",
                      borderLeft: `3px solid ${item.accent}`,
                      borderRadius: 10,
                      padding: "14px 16px",
                    }}
                  >
                    <div style={{ fontSize: 11, color: "#4a6a8a", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>
                      {item.label}
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: "#aac4e0", marginTop: 4 }}>{item.val}</div>
                    <div style={{ fontSize: 12, color: "#2a4060", marginTop: 2 }}>{item.sub}</div>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 12, color: "#2a4060", marginTop: 12 }}>
                Próximamente: cargá tu posición desde el Recorredor o manualmente.
              </p>
            </section>

            {/* ── Simulador de estrategias ─── */}
            <section
              style={{ background: "#16213e", border: "1px solid #1a4a80", borderRadius: 14, padding: "20px 22px", marginBottom: 24 }}
            >
              <h2 style={{ color: "#e0e0e0", fontSize: 18, fontWeight: 700, margin: "0 0 4px" }}>
                Simulador de estrategias
              </h2>
              <div style={{ fontSize: 12, color: "#4a6a8a", marginBottom: 20 }}>
                Visualizá el resultado neto de cada cobertura según el precio final
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 260px) 1fr", gap: 24 }} className="sim-grid">
                {/* Controls */}
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <Field label="Estrategia">
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 4 }}>
                      {ESTRATEGIAS.map((s) => (
                        <button
                          key={s.key}
                          onClick={() => setStrategy(s.key)}
                          style={{
                            border: "1px solid",
                            borderColor: strategy === s.key ? "#3dbb6e" : "#1a4a80",
                            background: strategy === s.key ? "#0f3a1a" : "#0f2040",
                            color: strategy === s.key ? "#3dbb6e" : "#6a8ab0",
                            borderRadius: 8,
                            padding: "8px 4px",
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </Field>
                  <Field label="Cantidad (t)">
                    <NumInput value={qty} onChange={setQty} step={10} min={1} />
                  </Field>
                  <Field label={strategy === "forward" || strategy === "futuro" ? "Precio pactado (USD/t)" : "Strike (USD/t)"}>
                    <NumInput value={strike} onChange={setStrike} step={5} min={1} />
                  </Field>
                  {(strategy === "put" || strategy === "call") && (
                    <Field label="Prima (USD/t)">
                      <NumInput value={premium} onChange={setPremium} step={0.5} min={0} />
                    </Field>
                  )}
                  {/* Result summary */}
                  <div style={{ background: "#0f2040", borderRadius: 10, padding: "12px 14px", marginTop: 4 }}>
                    <div style={{ fontSize: 11, color: "#4a6a8a", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                      Al precio actual ({currentPrice} USD/t)
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: "#e2b04a" }}>
                      {strategy === "put" && (() => {
                        const result = putPayoff(currentPrice, strike, premium) * qty;
                        return `${result >= 0 ? "+" : ""}${Math.round(result).toLocaleString("es-AR")} USD`;
                      })()}
                      {strategy === "call" && (() => {
                        const result = callPayoff(currentPrice, strike, premium) * qty;
                        return `${result >= 0 ? "+" : ""}${Math.round(result).toLocaleString("es-AR")} USD`;
                      })()}
                      {strategy === "forward" && (() => {
                        const result = forwardPayoff(currentPrice, strike) * qty;
                        return `${result >= 0 ? "+" : ""}${Math.round(result).toLocaleString("es-AR")} USD`;
                      })()}
                      {strategy === "futuro" && (() => {
                        const result = futurePayoff(currentPrice, strike) * qty;
                        return `${result >= 0 ? "+" : ""}${Math.round(result).toLocaleString("es-AR")} USD`;
                      })()}
                    </div>
                    <div style={{ fontSize: 11, color: "#4a6a8a", marginTop: 2 }}>resultado neto vs. no cubrir</div>
                  </div>
                </div>
                {/* Payoff chart */}
                <div style={{ background: "#0f1a2e", borderRadius: 10, padding: "14px 8px", minWidth: 0 }}>
                  <PayoffChart
                    strategy={strategy}
                    strike={strike}
                    premium={premium}
                    currentPrice={currentPrice}
                  />
                  <p style={{ fontSize: 11, color: "#2a4060", textAlign: "center", marginTop: 6 }}>
                    Precio final al vencimiento (USD/t) → resultado neto (USD/t)
                  </p>
                </div>
              </div>
            </section>

            {/* Source note */}
            <div style={{ fontSize: 12, color: "#2a4060", textAlign: "center", paddingTop: 8 }}>
              Fuente: {data.source} · Actualizado: {new Date(data.updated_at).toLocaleString("es-AR")}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

// ── Small form helpers ────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 11, color: "#4a6a8a", textTransform: "uppercase" as const, letterSpacing: "0.06em", fontWeight: 600, display: "block", marginBottom: 4 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function NumInput({ value, onChange, step, min }: { value: number; onChange: (v: number) => void; step: number; min: number }) {
  return (
    <input
      type="number"
      value={value}
      step={step}
      min={min}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{
        width: "100%",
        background: "#0f2040",
        border: "1px solid #1a4a80",
        borderRadius: 8,
        padding: "9px 10px",
        fontSize: 14,
        color: "#e0e0e0",
        fontFamily: "inherit",
        outline: "none",
      }}
    />
  );
}
