CREATE OR REPLACE FUNCTION public.resolve_invite_short_code(p_code text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT invite_token
  FROM public.invite_short_codes
  WHERE code = regexp_replace(lower(trim(p_code)), '[^a-z0-9]+$', '')
$$;

REVOKE ALL ON FUNCTION public.resolve_invite_short_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_invite_short_code(text) TO anon, authenticated, service_role;