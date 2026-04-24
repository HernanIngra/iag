-- I.Ag - Esquema inicial
-- Ejecutar en el SQL Editor de Supabase (https://app.supabase.com → SQL Editor)
-- Idempotente: se puede ejecutar más de una vez sin errores.

-- ─────────────────────────────────────────────────────────────────────────────
-- Tabla: workspaces
-- Un workspace por usuario. UPSERT en cada auto-guardado.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS workspaces (
  user_id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  field_name        TEXT NOT NULL DEFAULT '',
  lot_count         INTEGER NOT NULL DEFAULT 0,
  collections       JSONB NOT NULL DEFAULT '[]',
  color_map         JSONB NOT NULL DEFAULT '{}',
  cultivo_color_map JSONB NOT NULL DEFAULT '{}',
  lot_data          JSONB NOT NULL DEFAULT '{}',
  all_rows          JSONB NOT NULL DEFAULT '[]',
  rinde_data        JSONB NOT NULL DEFAULT '{}',
  lot_notes         JSONB NOT NULL DEFAULT '{}',
  shp_files         TEXT[] NOT NULL DEFAULT '{}',
  csv_files         TEXT[] NOT NULL DEFAULT '{}',
  rinde_files       TEXT[] NOT NULL DEFAULT '{}',
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuarios gestionan su propio workspace" ON workspaces;
CREATE POLICY "Usuarios gestionan su propio workspace"        -- línea 27
  ON workspaces FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Tabla: user_profiles
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  role         TEXT NOT NULL DEFAULT 'ingeniero',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuarios ven y editan su propio perfil" ON user_profiles;
CREATE POLICY "Usuarios ven y editan su propio perfil"        -- línea 46
  ON user_profiles FOR ALL
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Trigger: crea perfil automáticamente al registrarse un usuario
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, display_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created                           -- línea 64
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
