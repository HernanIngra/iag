-- I.Ag - Empresas, perfiles de usuario, y compartir datos
-- Ejecutar en el SQL Editor de Supabase
-- Idempotente: se puede ejecutar más de una vez sin errores.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Onboarding flag + nuevos valores de role
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS onboarding_done boolean DEFAULT false;

-- Ampliar el CHECK para incluir asesor/productor (conserva 'ingeniero' por datos existentes)
ALTER TABLE user_profiles DROP CONSTRAINT IF EXISTS user_profiles_role_check;
ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_role_check
  CHECK (role IN ('asesor', 'productor', 'ingeniero'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Empresas
-- Un workspace puede tener N empresas (modelo holding).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS empresas (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   uuid REFERENCES auth.users NOT NULL,
  name       text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owner manages empresa" ON empresas;
CREATE POLICY "owner manages empresa" ON empresas
  FOR ALL USING (auth.uid() = owner_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Empresa members
-- La unidad de sharing es la empresa, no el workspace.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS empresa_members (
  empresa_id     uuid REFERENCES empresas NOT NULL,
  member_user_id uuid REFERENCES auth.users NOT NULL,
  invited_by     uuid REFERENCES auth.users,
  joined_at      timestamptz DEFAULT now(),
  PRIMARY KEY (empresa_id, member_user_id)
);

ALTER TABLE empresa_members ENABLE ROW LEVEL SECURITY;

-- Funciones SECURITY DEFINER para evitar recursión infinita entre empresas ↔ empresa_members
CREATE OR REPLACE FUNCTION is_empresa_owner(p_empresa_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM empresas WHERE id = p_empresa_id AND owner_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_empresa_member(p_empresa_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM empresa_members
    WHERE empresa_id = p_empresa_id AND member_user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER;

DROP POLICY IF EXISTS "owner manages empresa members" ON empresa_members;
CREATE POLICY "owner manages empresa members" ON empresa_members
  FOR ALL USING (is_empresa_owner(empresa_id));

DROP POLICY IF EXISTS "member can see own empresa membership" ON empresa_members;
CREATE POLICY "member can see own empresa membership" ON empresa_members
  FOR SELECT USING (auth.uid() = member_user_id);

-- Política en empresas que usa la función para evitar recursión:
DROP POLICY IF EXISTS "members can see shared empresa" ON empresas;
CREATE POLICY "members can see shared empresa" ON empresas
  FOR SELECT USING (is_empresa_member(id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Empresa invites (para emails que aún no tienen cuenta)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS empresa_invites (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     uuid REFERENCES empresas NOT NULL,
  invited_email  text NOT NULL,
  invited_by     uuid REFERENCES auth.users NOT NULL,
  accepted_at    timestamptz,
  created_at     timestamptz DEFAULT now()
);

ALTER TABLE empresa_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "inviter manages invites" ON empresa_invites;
CREATE POLICY "inviter manages invites" ON empresa_invites
  FOR ALL USING (auth.uid() = invited_by);

DROP POLICY IF EXISTS "invitee can see their invite" ON empresa_invites;
CREATE POLICY "invitee can see their invite" ON empresa_invites
  FOR SELECT USING ((auth.jwt() ->> 'email') = invited_email);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. File meta en workspaces
-- Arrays de {name, empresaId} para saber a qué empresa pertenece cada archivo.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS shp_file_meta   jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS csv_file_meta   jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS rinde_file_meta jsonb DEFAULT '[]';

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Workspaces RLS: permitir lectura/escritura a miembros de empresa
-- ─────────────────────────────────────────────────────────────────────────────

-- Las políticas originales siguen vigentes para el owner.
-- Agregamos políticas para los miembros de empresas dentro del workspace.

DROP POLICY IF EXISTS "empresa members can read owner workspace" ON workspaces;
CREATE POLICY "empresa members can read owner workspace" ON workspaces
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM empresa_members em
      JOIN empresas e ON e.id = em.empresa_id
      WHERE e.owner_id = workspaces.user_id
        AND em.member_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "empresa members can update owner workspace" ON workspaces;
CREATE POLICY "empresa members can update owner workspace" ON workspaces
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM empresa_members em
      JOIN empresas e ON e.id = em.empresa_id
      WHERE e.owner_id = workspaces.user_id
        AND em.member_user_id = auth.uid()
    )
  );
