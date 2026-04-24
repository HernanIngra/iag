"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) { setError("Las contraseñas no coinciden."); return; }
    if (password.length < 6) { setError("La contraseña debe tener al menos 6 caracteres."); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) setError(error.message);
    else setDone(true);
    setBusy(false);
  };

  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-6" style={{ background: "#1a1a2e" }}>
      <div className="w-full max-w-sm rounded-2xl p-8 flex flex-col gap-6" style={{ background: "#16213e", border: "1px solid #2a4a6a" }}>
        <div className="text-center">
          <h2 className="text-2xl font-bold mb-1" style={{ color: "#e2b04a" }}>I.Ag</h2>
          <p className="text-sm" style={{ color: "#6a8ab0" }}>{done ? "Contraseña actualizada" : "Nueva contraseña"}</p>
        </div>

        {done ? (
          <div className="flex flex-col gap-4 text-center">
            <p className="text-sm" style={{ color: "#aac4e0" }}>Tu contraseña fue actualizada correctamente.</p>
            <button
              onClick={() => router.push("/")}
              className="w-full py-2.5 rounded-xl font-semibold text-sm"
              style={{ background: "#e2b04a", color: "#1a1a2e" }}
            >
              Ir a la app
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <input
              type="password" placeholder="Nueva contraseña" value={password} required
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
              style={{ background: "#0d1b35", border: "1px solid #2a4a6a", color: "#ccd6e0" }}
            />
            <input
              type="password" placeholder="Confirmá la contraseña" value={confirm} required
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
              style={{ background: "#0d1b35", border: "1px solid #2a4a6a", color: "#ccd6e0" }}
            />
            {error && <p className="text-xs px-2 py-1.5 rounded" style={{ background: "#2a1a1a", color: "#e07070" }}>{error}</p>}
            <button
              type="submit" disabled={busy}
              className="w-full py-2.5 rounded-xl font-semibold text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: "#e2b04a", color: "#1a1a2e" }}
            >
              {busy ? "..." : "Guardar contraseña"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
