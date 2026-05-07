CREATE OR REPLACE FUNCTION public.ensure_platform_association_for_league(_association_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_id uuid;
  v_name text;
  v_abbr text;
  v_platform_id uuid;
BEGIN
  SELECT club_id, name, abbreviation, platform_association_id
    INTO v_club_id, v_name, v_abbr, v_platform_id
  FROM public.league_associations
  WHERE id = _association_id;

  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'League association not found';
  END IF;

  -- Authorize: caller must be club admin (or platform admin)
  IF NOT (public.has_role(auth.uid(), 'admin'::public.app_role)
          OR public.is_club_admin(auth.uid(), v_club_id)) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF v_platform_id IS NOT NULL THEN
    RETURN v_platform_id;
  END IF;

  INSERT INTO public.platform_league_associations (name, short_code, region, season_year, status)
  VALUES (
    v_name,
    COALESCE(NULLIF(v_abbr, ''), left(regexp_replace(v_name, '[^A-Za-z0-9]', '', 'g'), 12)),
    '',
    EXTRACT(year FROM now())::int,
    'active'
  )
  RETURNING id INTO v_platform_id;

  UPDATE public.league_associations
  SET platform_association_id = v_platform_id, updated_at = now()
  WHERE id = _association_id;

  RETURN v_platform_id;
END;
$$;