"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";

// ─── Auth ─────────────────────────────────────────────────────────────────────

const AuthContext = createContext<{ user: User | null; loading: boolean }>({
  user: null,
  loading: true,
});

export function useUser() {
  return useContext(AuthContext);
}

// ─── Theme ────────────────────────────────────────────────────────────────────

type Theme = "dark" | "light";
const THEME_KEY = "iag_theme";

const ThemeContext = createContext<{
  theme: Theme;
  setTheme: (t: Theme) => void;
}>({ theme: "dark", setTheme: () => {} });

export function useTheme() {
  return useContext(ThemeContext);
}

// ─── Providers ────────────────────────────────────────────────────────────────

export function Providers({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [theme, setThemeState] = useState<Theme>("dark");
  const supabase = createClient();

  // Load saved theme and apply it to <html> before first paint
  useEffect(() => {
    const saved = (localStorage.getItem(THEME_KEY) as Theme | null) ?? "dark";
    setThemeState(saved);
    document.documentElement.classList.toggle("light", saved === "light");
  }, []);

  function setTheme(t: Theme) {
    setThemeState(t);
    localStorage.setItem(THEME_KEY, t);
    document.documentElement.classList.toggle("light", t === "light");
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      <AuthContext.Provider value={{ user, loading }}>
        {children}
      </AuthContext.Provider>
    </ThemeContext.Provider>
  );
}
