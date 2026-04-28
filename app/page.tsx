"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import type { User } from "@supabase/supabase-js";

const apps = [
  {
    href: "/recorredor",
    emoji: "🌿",
    action: "Recorrer",
    subtitle: "Recorredor",
    description:
      "Recorrí tus lotes con el mapa en mano. Cargá labores, rindes históricos, anotá lo que ves en el campo.",
    available: true,
    badge: null,
  },
  {
    href: "/comparador",
    emoji: "📊",
    action: "Comparar",
    subtitle: "Comparador",
    description:
      "Compará genéticas y agroquímicos con tus ensayos. Entendé qué materiales funcionan mejor en cada ambiente.",
    available: true,
    badge: null,
  },
  {
    href: "/presupuesto",
    emoji: "📋",
    action: "Analizar",
    subtitle: "Presupuesto y análisis",
    description:
      "Armá el presupuesto de la campaña, seguí la ejecución y cerrá el resultado por lote, campo o empresa.",
    available: false,
    badge: "Próximamente",
  },
];

export default function HomePage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [entered, setEntered] = useState(false);
  const supabase = createSupabaseBrowserClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center" style={{ background: "#1a1a2e" }}>
        <span className="text-2xl font-bold tracking-widest" style={{ color: "#e2b04a" }}>
          I.Ag
        </span>
      </main>
    );
  }

  // Show app cards if authenticated OR chose to enter
  if (user || entered) {
    return <AppScreen user={user} onSignOut={() => { setUser(null); setEntered(false); }} supabase={supabase} />;
  }

  // Entry screen
  return <EntryScreen onEnterAsVisitor={() => setEntered(true)} />;
}

// ── Entry screen ───────────────────────────────────────────────────────────────

function EntryScreen({ onEnterAsVisitor }: { onEnterAsVisitor: () => void }) {
  return (
    <main
      className="flex-1 flex flex-col items-center justify-center px-6 py-12"
      style={{ background: "#1a1a2e" }}
    >
      <div className="w-full max-w-sm flex flex-col items-center gap-8">
        {/* Logo */}
        <div className="text-center">
          <h1 className="text-6xl font-bold tracking-widest" style={{ color: "#e2b04a" }}>
            I.Ag
          </h1>
          <p className="mt-2 text-base" style={{ color: "#aac4e0" }}>
            Inteligencia Agronómica
          </p>
        </div>

        {/* Description */}
        <p className="text-sm text-center leading-relaxed" style={{ color: "#6a8ab0" }}>
          Recorrí tus lotes, comparás genéticas y analizás tu campaña — todo en un solo lugar.
        </p>

        {/* Auth card */}
        <div
          className="w-full rounded-2xl p-6 flex flex-col gap-4"
          style={{ background: "#16213e", border: "1px solid #0f3460" }}
        >
          <Link
            href="/login"
            className="w-full py-3 px-4 rounded-lg font-semibold flex items-center justify-center gap-3 transition-opacity"
            style={{ background: "#fff", color: "#333" }}
          >
            <GoogleIcon />
            Ingresar con Google
          </Link>

          <div className="flex items-center gap-3">
            <hr className="flex-1" style={{ borderColor: "#1a3460" }} />
            <span className="text-xs" style={{ color: "#445566" }}>
              o
            </span>
            <hr className="flex-1" style={{ borderColor: "#1a3460" }} />
          </div>

          <button
            onClick={onEnterAsVisitor}
            className="w-full py-3 px-4 rounded-lg font-semibold transition-opacity"
            style={{
              background: "transparent",
              color: "#aac4e0",
              border: "1px solid #1a4a80",
            }}
          >
            Entrar como visitante
          </button>

          <p className="text-xs text-center" style={{ color: "#445566" }}>
            Como visitante, los datos no se guardan entre sesiones.
          </p>
        </div>
      </div>

      <p className="mt-12 text-xs" style={{ color: "#2a3a50" }}>
        I.Ag · Abril 2026
      </p>
    </main>
  );
}

// ── App screen (cards) ─────────────────────────────────────────────────────────

function AppScreen({
  user,
  onSignOut,
  supabase,
}: {
  user: User | null;
  onSignOut: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  async function signOut() {
    await supabase.auth.signOut();
    onSignOut();
  }

  const name = user?.user_metadata?.full_name ?? user?.email?.split("@")[0] ?? null;
  const avatar = user?.user_metadata?.avatar_url as string | undefined;
  const firstName = name?.split(" ")[0] ?? null;

  return (
    <main
      className="flex-1 flex flex-col items-center justify-center px-6 py-12 relative"
      style={{ background: "#1a1a2e" }}
    >
      {/* Top nav */}
      <div className="absolute top-4 right-6">
        {user ? (
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 px-2 py-1 rounded-lg transition-colors"
              style={{ background: menuOpen ? "#16213e" : "transparent" }}
            >
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatar} alt={name ?? ""} className="w-7 h-7 rounded-full" />
              ) : (
                <span
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                  style={{ background: "#1a4a80", color: "#e2b04a" }}
                >
                  {name?.[0]?.toUpperCase() ?? "U"}
                </span>
              )}
              <span className="text-sm hidden sm:block" style={{ color: "#aac4e0" }}>
                {firstName}
              </span>
              <span className="text-xs" style={{ color: "#4a6a8a" }}>▾</span>
            </button>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div
                  className="absolute right-0 top-10 z-20 rounded-xl py-1 min-w-[160px] shadow-xl"
                  style={{ background: "#16213e", border: "1px solid #0f3460" }}
                >
                  <div className="px-4 py-2 border-b" style={{ borderColor: "#0f3460" }}>
                    <p className="text-xs font-semibold" style={{ color: "#e2b04a" }}>{name}</p>
                    <p className="text-xs truncate" style={{ color: "#445566" }}>{user.email}</p>
                  </div>
                  <button
                    onClick={signOut}
                    className="w-full text-left px-4 py-2 text-sm transition-colors hover:bg-[#1a3060]"
                    style={{ color: "#aac4e0" }}
                  >
                    Cerrar sesión
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <Link
            href="/login"
            className="text-xs font-semibold px-3 py-1.5 rounded"
            style={{ background: "#1a4a80", color: "#aac4e0", border: "1px solid #2a5298" }}
          >
            Ingresar
          </Link>
        )}
      </div>

      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="text-5xl font-bold tracking-widest mb-3" style={{ color: "#e2b04a" }}>
          I.Ag
        </h1>
        <p className="text-lg" style={{ color: "#aac4e0" }}>
          {name ? `Bienvenido, ${name.split(" ")[0]}` : "Inteligencia Agronómica"}
        </p>
      </div>

      {/* Question */}
      <h2 className="text-xl md:text-2xl font-semibold mb-8 text-center" style={{ color: "#e0e0e0" }}>
        ¿Qué querés hacer?
      </h2>

      {/* App cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl">
        {apps.map((app) => (
          <AppCard key={app.href} {...app} />
        ))}
      </div>

      <p className="mt-16 text-sm" style={{ color: "#4a6a8a" }}>
        I.Ag · Abril 2026
      </p>
    </main>
  );
}

// ── App card ───────────────────────────────────────────────────────────────────

function AppCard({
  href,
  emoji,
  action,
  subtitle,
  description,
  available,
  badge,
}: (typeof apps)[0]) {
  const inner = (
    <div
      className="relative flex flex-col gap-4 p-6 rounded-xl border-2 h-full transition-all duration-200"
      style={{
        background: "#16213e",
        borderColor: available ? "#3dbb6e" : "#1a4a80",
        opacity: available ? 1 : 0.6,
      }}
    >
      {badge && (
        <span
          className="absolute top-4 right-4 text-xs font-semibold px-2 py-1 rounded-full"
          style={{ background: "#0f3460", color: "#6a8ab0" }}
        >
          {badge}
        </span>
      )}
      <span className="text-4xl">{emoji}</span>
      <div>
        <h3 className="text-2xl font-bold" style={{ color: "#e2b04a" }}>
          {action}
        </h3>
        <p className="text-xs mt-0.5" style={{ color: "#6a8ab0" }}>
          {subtitle}
        </p>
      </div>
      <p className="text-sm leading-relaxed flex-1" style={{ color: "#aac4e0" }}>
        {description}
      </p>
      {available && (
        <span className="text-sm font-semibold mt-auto" style={{ color: "#3dbb6e" }}>
          Ir →
        </span>
      )}
    </div>
  );

  if (available) {
    return (
      <Link href={href} className="flex hover:scale-[1.02] transition-transform">
        {inner}
      </Link>
    );
  }
  return <div className="flex">{inner}</div>;
}

// ── Google icon ────────────────────────────────────────────────────────────────

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}
