"use client";

import Link from "next/link";

const cards = [
  {
    href: "/analisis/comercial",
    icon: "📈",
    action: "Análisis comercial",
    description: "Cotizaciones de granos en tiempo real, evolución histórica, posición física y simulador de coberturas.",
    available: true,
    badge: null,
  },
  {
    href: "#",
    icon: "🌾",
    action: "Análisis de campaña",
    description: "Resultado por lote, campo y empresa. Márgenes reales vs. presupuesto.",
    available: false,
    badge: "Próximamente",
  },
  {
    href: "#",
    icon: "📋",
    action: "Control presupuestario",
    description: "Armá el presupuesto de la campaña y seguí la ejecución en tiempo real.",
    available: false,
    badge: "Próximamente",
  },
];

export default function AnalisisPage() {
  return (
    <main
      className="flex-1 flex flex-col items-center justify-center px-6 py-12"
      style={{ background: "#1a1a2e", minHeight: "100vh" }}
    >
      <div style={{ width: "100%", maxWidth: 860 }}>
        <Link href="/" style={{ color: "#4a6a8a", fontSize: 13, display: "block", marginBottom: 32 }}>
          ← Inicio
        </Link>
        <h1 style={{ color: "#e2b04a", fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Análisis</h1>
        <p style={{ color: "#6a8ab0", fontSize: 14, marginBottom: 36 }}>¿Qué querés analizar?</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {cards.map((card) => {
            const inner = (
              <div
                style={{
                  background: "#16213e",
                  border: `2px solid ${card.available ? "#3dbb6e" : "#1a4a80"}`,
                  borderRadius: 14,
                  padding: "28px 22px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                  height: "100%",
                  opacity: card.available ? 1 : 0.6,
                  position: "relative",
                }}
              >
                {card.badge && (
                  <span
                    style={{
                      position: "absolute",
                      top: 14,
                      right: 14,
                      fontSize: 10,
                      fontWeight: 700,
                      background: "#0f3460",
                      color: "#6a8ab0",
                      borderRadius: 999,
                      padding: "2px 10px",
                    }}
                  >
                    {card.badge}
                  </span>
                )}
                <span style={{ fontSize: 36 }}>{card.icon}</span>
                <div>
                  <h3 style={{ color: "#e2b04a", fontSize: 18, fontWeight: 700, margin: 0 }}>{card.action}</h3>
                </div>
                <p style={{ color: "#aac4e0", fontSize: 13, lineHeight: 1.55, flex: 1, margin: 0 }}>{card.description}</p>
                {card.available && (
                  <span style={{ color: "#3dbb6e", fontSize: 13, fontWeight: 600 }}>Ir →</span>
                )}
              </div>
            );

            if (card.available) {
              return (
                <Link key={card.href} href={card.href} className="flex hover:scale-[1.02] transition-transform">
                  {inner}
                </Link>
              );
            }
            return <div key={card.action} className="flex">{inner}</div>;
          })}
        </div>
      </div>
    </main>
  );
}
