"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { getUserProfile, setOnboardingDone, createEmpresa } from "@/lib/db";

type Step = "role" | "empresa";
type Role = "asesor" | "productor";

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [checking, setChecking] = useState(true);
  const [step, setStep] = useState<Step>("role");
  const [role, setRole] = useState<Role>("asesor");
  const [empresaName, setEmpresaName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function check() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/login"); return; }
      const profile = await getUserProfile(supabase);
      if (profile?.onboarding_done) { router.replace("/recorredor"); return; }
      setChecking(false);
    }
    check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleFinish() {
    if (!empresaName.trim()) { setError("Ingresá el nombre de tu empresa o campo."); return; }
    setLoading(true);
    setError("");
    try {
      await createEmpresa(supabase, empresaName.trim());
      await setOnboardingDone(supabase, role);
      router.replace("/recorredor");
    } catch (e) {
      setError((e as Error).message);
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <main className="flex-1 flex items-center justify-center" style={{ background: "#1a1a2e" }}>
        <span className="text-2xl font-bold tracking-widest" style={{ color: "#e2b04a" }}>I.Ag</span>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col items-center justify-center px-6 py-12" style={{ background: "#1a1a2e" }}>
      <div className="w-full max-w-sm flex flex-col gap-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-widest" style={{ color: "#e2b04a" }}>I.Ag</h1>
          <p className="mt-2 text-base" style={{ color: "#aac4e0" }}>Bienvenido — configuremos tu cuenta</p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-2 justify-center">
          {(["role", "empresa"] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                style={{
                  background: step === s ? "#e2b04a" : s === "empresa" && step === "empresa" ? "#1a4a80" : "#0f3460",
                  color: step === s ? "#1a1a2e" : "#6a8ab0",
                }}
              >
                {i + 1}
              </div>
              {i === 0 && <div className="w-8 h-px" style={{ background: "#0f3460" }} />}
            </div>
          ))}
        </div>

        <div className="rounded-2xl p-6 flex flex-col gap-5" style={{ background: "#16213e", border: "1px solid #0f3460" }}>
          {step === "role" ? (
            <>
              <h2 className="text-lg font-semibold" style={{ color: "#e0e0e0" }}>¿Cuál es tu rol?</h2>
              <div className="flex flex-col gap-3">
                {(["asesor", "productor"] as Role[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => setRole(r)}
                    className="w-full p-4 rounded-xl text-left transition-all"
                    style={{
                      background: role === r ? "#1a4a80" : "#0f2040",
                      border: `2px solid ${role === r ? "#3dbb6e" : "#1a3460"}`,
                    }}
                  >
                    <p className="font-semibold" style={{ color: role === r ? "#e2b04a" : "#aac4e0" }}>
                      {r === "asesor" ? "Soy asesor" : "Soy productor"}
                    </p>
                    <p className="text-xs mt-0.5" style={{ color: "#6a8ab0" }}>
                      {r === "asesor"
                        ? "Asesoro a productores, gestiono múltiples campos"
                        : "Gestiono mi propio campo o empresa agropecuaria"}
                    </p>
                  </button>
                ))}
              </div>
              <button
                onClick={() => setStep("empresa")}
                className="w-full py-3 rounded-lg font-semibold transition-opacity"
                style={{ background: "#e2b04a", color: "#1a1a2e" }}
              >
                Siguiente →
              </button>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold" style={{ color: "#e0e0e0" }}>
                {role === "asesor" ? "Creá tu primera empresa cliente" : "¿Cómo se llama tu campo o empresa?"}
              </h2>
              <p className="text-sm" style={{ color: "#6a8ab0" }}>
                Podés agregar más empresas después.
              </p>
              <input
                type="text"
                value={empresaName}
                onChange={(e) => setEmpresaName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleFinish()}
                placeholder={role === "asesor" ? "Ej: Estancia Don José" : "Ej: Campo La Esperanza"}
                className="w-full px-4 py-3 rounded-lg outline-none text-sm"
                style={{
                  background: "#0f2040",
                  border: "1px solid #1a3460",
                  color: "#e0e0e0",
                }}
                autoFocus
              />
              {error && <p className="text-xs" style={{ color: "#f87171" }}>{error}</p>}
              <div className="flex gap-3">
                <button
                  onClick={() => setStep("role")}
                  className="px-4 py-3 rounded-lg text-sm font-semibold"
                  style={{ background: "#0f2040", color: "#6a8ab0", border: "1px solid #1a3460" }}
                >
                  ← Atrás
                </button>
                <button
                  onClick={handleFinish}
                  disabled={loading}
                  className="flex-1 py-3 rounded-lg font-semibold transition-opacity disabled:opacity-50"
                  style={{ background: "#3dbb6e", color: "#fff" }}
                >
                  {loading ? "Creando..." : "Crear y empezar"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
