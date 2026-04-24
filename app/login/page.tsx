"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "login" | "signup" | "forgot" | "check-email";

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const reset = () => { setEmail(""); setPassword(""); setName(""); setError(""); };

  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/` },
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);

    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message === "Invalid login credentials" ? "Email o contraseña incorrectos." : error.message);
      else router.push("/");

    } else if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name: name } },
      });
      if (error) setError(error.message);
      else setMode("check-email");

    } else if (mode === "forgot") {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset`,
      });
      if (error) setError(error.message);
      else setMode("check-email");
    }

    setBusy(false);
  };

  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-6" style={{ background: "#1a1a2e" }}>
      <div className="w-full max-w-sm rounded-2xl p-8 flex flex-col gap-6" style={{ background: "#16213e", border: "1px solid #2a4a6a" }}>

        <div className="text-center">
          <a href="/" className="text-4xl font-bold tracking-widest" style={{ color: "#e2b04a" }}>I.Ag</a>
          <p className="mt-1 text-sm" style={{ color: "#6a8ab0" }}>
            {mode === "signup" ? "Creá tu cuenta" : mode === "forgot" ? "Recuperar contraseña" : mode === "check-email" ? "Revisá tu correo" : "Iniciá sesión"}
          </p>
        </div>

        {mode === "check-email" ? (
          <div className="flex flex-col gap-4 text-center">
            <p className="text-sm" style={{ color: "#aac4e0" }}>
              Te mandamos un email a <strong>{email}</strong>. Hacé clic en el enlace para continuar.
            </p>
            <button onClick={() => { setMode("login"); reset(); }} className="text-sm" style={{ color: "#6a8ab0" }}>
              ← Volver al inicio de sesión
            </button>
          </div>
        ) : (
          <>
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              {mode === "signup" && (
                <input
                  type="text" placeholder="Tu nombre" value={name} required
                  onChange={(e) => setName(e.target.value)}
                  className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
                  style={{ background: "#0d1b35", border: "1px solid #2a4a6a", color: "#ccd6e0" }}
                />
              )}
              <input
                type="email" placeholder="Email" value={email} required
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
                style={{ background: "#0d1b35", border: "1px solid #2a4a6a", color: "#ccd6e0" }}
              />
              {mode !== "forgot" && (
                <input
                  type="password" placeholder="Contraseña" value={password} required
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg px-3 py-2.5 text-sm outline-none"
                  style={{ background: "#0d1b35", border: "1px solid #2a4a6a", color: "#ccd6e0" }}
                />
              )}
              {error && <p className="text-xs px-2 py-1.5 rounded" style={{ background: "#2a1a1a", color: "#e07070" }}>{error}</p>}
              <button
                type="submit" disabled={busy}
                className="w-full py-2.5 rounded-xl font-semibold text-sm transition-opacity hover:opacity-90 disabled:opacity-50"
                style={{ background: "#e2b04a", color: "#1a1a2e" }}
              >
                {busy ? "..." : mode === "login" ? "Entrar" : mode === "signup" ? "Crear cuenta" : "Enviar enlace"}
              </button>
            </form>

            {(mode === "login" || mode === "signup") && (
              <>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px" style={{ background: "#1a3a5c" }} />
                  <span className="text-xs" style={{ color: "#4a6a8a" }}>o</span>
                  <div className="flex-1 h-px" style={{ background: "#1a3a5c" }} />
                </div>
                <button
                  onClick={handleGoogleLogin}
                  className="flex items-center justify-center gap-3 w-full py-2.5 rounded-xl font-semibold text-sm transition-opacity hover:opacity-90"
                  style={{ background: "#fff", color: "#1a1a2e" }}
                >
                  <svg width="18" height="18" viewBox="0 0 18 18">
                    <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
                    <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/>
                    <path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/>
                    <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"/>
                  </svg>
                  Ingresar con Google
                </button>
              </>
            )}

            <div className="flex flex-col items-center gap-2 text-xs" style={{ color: "#4a6a8a" }}>
              {mode === "login" && (
                <>
                  <button onClick={() => { setMode("signup"); reset(); }}>¿No tenés cuenta? Registrate →</button>
                  <button onClick={() => { setMode("forgot"); reset(); }}>Olvidé mi contraseña</button>
                </>
              )}
              {mode === "signup" && (
                <button onClick={() => { setMode("login"); reset(); }}>¿Ya tenés cuenta? Iniciá sesión →</button>
              )}
              {mode === "forgot" && (
                <button onClick={() => { setMode("login"); reset(); }}>← Volver</button>
              )}
              <a href="/recorredor" style={{ color: "#4a6a8a" }}>Continuar sin cuenta →</a>
            </div>
          </>
        )}
      </div>

      <p className="mt-8 text-xs" style={{ color: "#2a3a4a" }}>I.Ag · Abril 2026</p>
    </main>
  );
}
