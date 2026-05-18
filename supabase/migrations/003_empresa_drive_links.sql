-- I.Ag - Drive links persistentes por empresa
-- Ejecutar en el SQL Editor de Supabase
-- Idempotente: se puede ejecutar más de una vez sin errores.

-- Agrega columna para guardar links de Drive por empresa (manejo, rinde, lluvia).
-- El JSON tiene la forma: { [empresaId]: { manejoLink, rindeLink, lluviaLink } }

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS empresa_drive_links jsonb DEFAULT '{}';
