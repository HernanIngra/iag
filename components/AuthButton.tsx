"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import type { User } from "@supabase/supabase-js";

export default function AuthButton() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createSupabaseBrowserClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.reload();
  }

  if (loading) return null;

  if (!user) {
    return (
      <a
        href="/login"
        className="text-xs font-semibold px-3 py-1.5 rounded"
        style={{ background: "#1a4a80", color: "#aac4e0", border: "1px solid #2a5298" }}
      >
        Ingresar
      </a>
    );
  }

  const name = user.user_metadata?.full_name ?? user.email?.split("@")[0] ?? "Vos";
  const avatar = user.user_metadata?.avatar_url as string | undefined;

  return (
    <div className="flex items-center gap-2">
      {avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatar} alt={name} className="w-7 h-7 rounded-full" />
      ) : (
        <span className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
          style={{ background: "#1a4a80", color: "#e2b04a" }}>
          {name[0].toUpperCase()}
        </span>
      )}
      <button
        onClick={signOut}
        className="text-xs"
        style={{ color: "#6a8ab0" }}
        title="Cerrar sesión"
      >
        ×
      </button>
    </div>
  );
}
