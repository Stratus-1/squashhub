ALTER TABLE public.league_associations
  ADD COLUMN IF NOT EXISTS discipline text NOT NULL DEFAULT 'singles';

ALTER TABLE public.league_associations
  DROP CONSTRAINT IF EXISTS league_associations_discipline_check;

ALTER TABLE public.league_associations
  ADD CONSTRAINT league_associations_discipline_check
  CHECK (discipline IN ('singles','doubles'));

CREATE OR REPLACE FUNCTION public.rename_internal_league_association(
  _association_id uuid,
  _name text,
  _discipline text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_id uuid;
  v_scope text;
  v_platform_id uuid;
  v_name text := btrim(coalesce(_name, ''));
BEGIN
  SELECT club_id, scope, platform_association_id
    INTO v_club_id, v_scope, v_platform_id
  FROM public.league_associations
  WHERE id = _association_id;

  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'League not found';
  END IF;

  IF NOT (public.has_role(auth.uid(), 'admin'::public.app_role)
          OR public.is_club_admin_or_permitted(auth.uid(), v_club_id, 'leagues')) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF v_scope IS DISTINCT FROM 'internal' THEN
    RAISE EXCEPTION 'Only club-owned internal leagues can be renamed here';
  END IF;

  IF v_name = '' THEN
    RAISE EXCEPTION 'Name is required';
  END IF;

  IF _discipline IS NOT NULL AND _discipline NOT IN ('singles','doubles') THEN
    RAISE EXCEPTION 'Invalid discipline';
  END IF;

  -- Display name only. Abbreviation / short_code are load-bearing (team codes) and never touched.
  UPDATE public.league_associations
     SET name = v_name,
         discipline = COALESCE(_discipline, discipline),
         updated_at = now()
   WHERE id = _association_id;

  IF v_platform_id IS NOT NULL THEN
    UPDATE public.platform_league_associations
       SET name = v_name
     WHERE id = v_platform_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rename_internal_league_association(uuid, text, text) TO authenticated;