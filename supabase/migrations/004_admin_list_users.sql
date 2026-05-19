-- I.Ag - Función para que el admin pueda listar usuarios
-- Ejecutar en el SQL Editor de Supabase
-- Idempotente: se puede ejecutar más de una vez sin errores.

-- Función SECURITY DEFINER: corre como postgres (bypassea RLS)
-- Solo el admin puede llamarla (verifica el email del JWT).
CREATE OR REPLACE FUNCTION admin_list_users()
RETURNS TABLE (
  id          uuid,
  display_name text,
  email       text,
  role        text,
  created_at  timestamptz
) AS $$
DECLARE
  caller_email text;
BEGIN
  caller_email := (auth.jwt() ->> 'email');

  IF caller_email IS DISTINCT FROM 'hernaningrassia@gmail.com' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
  SELECT
    up.id,
    up.display_name,
    au.email::text,
    up.role,
    up.created_at
  FROM user_profiles up
  JOIN auth.users au ON au.id = up.id
  ORDER BY up.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
