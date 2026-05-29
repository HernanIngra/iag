-- Unique constraint needed for upsert in invite-empresa API route
ALTER TABLE empresa_invites
  DROP CONSTRAINT IF EXISTS empresa_invites_empresa_email_unique,
  ADD CONSTRAINT empresa_invites_empresa_email_unique
    UNIQUE (empresa_id, invited_email);
