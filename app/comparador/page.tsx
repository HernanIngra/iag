import Link from "next/link";

export default function ComparadorPage() {
  return (
    <main
      className="flex-1 flex flex-col items-center justify-center px-6 py-12"
      style={{ background: "#1a1a2e" }}
    >
      <div className="w-full max-w-3xl">
        {/* Header */}
        <div className="mb-10">
          <Link href="/" className="text-sm mb-4 inline-block" style={{ color: "#4a6a8a" }}>
            ← I.Ag
          </Link>
          <h1 className="text-4xl font-bold tracking-wide" style={{ color: "#e2b04a" }}>
            Comparador
          </h1>
          <p className="mt-2 text-sm" style={{ color: "#6a8ab0" }}>
            Compará genéticas y agroquímicos con datos reales de ensayos.
          </p>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Genética — activo */}
          <Link
            href="/comparador/genetica/comparacion"
            className="flex hover:scale-[1.02] transition-transform"
          >
            <div
              className="relative flex flex-col gap-4 p-6 rounded-xl border-2 h-full w-full"
              style={{ background: "#16213e", borderColor: "#3dbb6e" }}
            >
              <span className="text-4xl">🌽</span>
              <div>
                <h2 className="text-2xl font-bold" style={{ color: "#e2b04a" }}>
                  Genética / ECR
                </h2>
                <p className="text-xs mt-0.5" style={{ color: "#6a8ab0" }}>
                  Ensayos comparativos de rendimiento
                </p>
              </div>
              <p className="text-sm leading-relaxed flex-1" style={{ color: "#aac4e0" }}>
                Compará híbridos y variedades en localidades reales. Mirá el
                promedio cabeza a cabeza y la respuesta al ambiente.
              </p>
              <span className="text-sm font-semibold mt-auto" style={{ color: "#3dbb6e" }}>
                Ver comparación →
              </span>
            </div>
          </Link>

          {/* Precios — placeholder */}
          <div className="flex">
            <div
              className="relative flex flex-col gap-4 p-6 rounded-xl border-2 h-full w-full"
              style={{ background: "#16213e", borderColor: "#1a4a80", opacity: 0.5 }}
            >
              <span className="absolute top-4 right-4 text-xs font-semibold px-2 py-1 rounded-full"
                style={{ background: "#0f3460", color: "#6a8ab0" }}>
                Próximamente
              </span>
              <span className="text-4xl">💰</span>
              <div>
                <h2 className="text-2xl font-bold" style={{ color: "#e2b04a" }}>
                  Precios
                </h2>
                <p className="text-xs mt-0.5" style={{ color: "#6a8ab0" }}>
                  Tarifas e insumos
                </p>
              </div>
              <p className="text-sm leading-relaxed flex-1" style={{ color: "#aac4e0" }}>
                Consultá tarifas de labores y precios de insumos para armar el
                presupuesto de tu campaña.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
