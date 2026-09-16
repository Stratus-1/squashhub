CREATE TABLE IF NOT EXISTS public.invite_short_codes (
  code text PRIMARY KEY,
  invite_token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.invite_short_codes TO service_role;
ALTER TABLE public.invite_short_codes ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.ensure_invite_short_code(p_token text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_code text;
  v_alphabet text := 'abcdefghijkmnpqrstuvwxyz23456789';
  i int;
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 THEN
    RAISE EXCEPTION 'This invitation link is not valid';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.club_champs_registrations WHERE invite_token = p_token) THEN
    RAISE EXCEPTION 'This invitation link is not valid';
  END IF;

  SELECT code INTO v_code FROM public.invite_short_codes WHERE invite_token = p_token;
  IF v_code IS NOT NULL THEN RETURN v_code; END IF;

  FOR attempt IN 1..8 LOOP
    v_code := '';
    FOR i IN 1..10 LOOP
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    END LOOP;
    BEGIN
      INSERT INTO public.invite_short_codes (code, invite_token) VALUES (v_code, p_token);
      RETURN v_code;
    EXCEPTION WHEN unique_violation THEN
      -- another invite already owns this code (or this token got one meanwhile)
      SELECT code INTO v_code FROM public.invite_short_codes WHERE invite_token = p_token;
      IF v_code IS NOT NULL THEN RETURN v_code; END IF;
    END;
  END LOOP;

  RAISE EXCEPTION 'Could not create a short invitation link';
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_invite_short_code(p_code text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT invite_token FROM public.invite_short_codes WHERE code = lower(trim(p_code))
$$;

REVOKE ALL ON FUNCTION public.ensure_invite_short_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_invite_short_code(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_invite_short_code(text) TO anon, authenticated, service_role;