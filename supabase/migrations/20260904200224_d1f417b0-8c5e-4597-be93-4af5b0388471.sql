
-- 1) Backfill: club-side league_associations rows that were never linked to the association tenant
UPDATE public.league_associations la
SET tenant_association_id = t.association_tenant_id,
    platform_association_id = COALESCE(la.platform_association_id, t.platform_association_id)
FROM (
  SELECT a.club_id, a.association_tenant_id, la2.platform_association_id, la2.name
  FROM public.association_affiliated_clubs a
  JOIN LATERAL (
    SELECT x.platform_association_id, x.name
    FROM public.league_associations x
    WHERE x.tenant_association_id = a.association_tenant_id
    LIMIT 1
  ) la2 ON true
  WHERE a.status = 'active'
) t
WHERE la.club_id = t.club_id
  AND la.tenant_association_id IS NULL
  AND lower(la.name) = lower(t.name);

-- 2) Submission stamp
ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS submitted_to_association_at timestamptz;

-- 3) Club admin submit action
CREATE OR REPLACE FUNCTION public.club_submit_association_roster(
  _club_id uuid, _association_id uuid, _season_year integer DEFAULT NULL)
RETURNS TABLE(teams integer, players integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_teams integer := 0; v_players integer := 0; v_tenant uuid;
BEGIN
  IF NOT public.is_club_admin(auth.uid(), _club_id) THEN
    RAISE EXCEPTION 'Not a club admin';
  END IF;

  -- Make sure the club's association record is linked to the association workspace
  SELECT a.association_tenant_id INTO v_tenant
  FROM public.association_affiliated_clubs a
  JOIN public.league_associations la ON la.id = _association_id
  WHERE a.club_id = _club_id AND a.status = 'active'
    AND EXISTS (
      SELECT 1 FROM public.league_associations x
      WHERE x.tenant_association_id = a.association_tenant_id
        AND lower(x.name) = lower(la.name)
    )
  LIMIT 1;

  IF v_tenant IS NOT NULL THEN
    UPDATE public.league_associations
    SET tenant_association_id = COALESCE(tenant_association_id, v_tenant),
        platform_association_id = COALESCE(
          platform_association_id,
          (SELECT x.platform_association_id FROM public.league_associations x
            WHERE x.tenant_association_id = v_tenant AND x.platform_association_id IS NOT NULL LIMIT 1))
    WHERE id = _association_id;
  END IF;

  UPDATE public.leagues l
  SET submitted_to_association_at = now()
  WHERE l.club_id = _club_id
    AND l.association_id = _association_id
    AND l.archived_at IS NULL
    AND (_season_year IS NULL OR l.season_year IS NOT DISTINCT FROM _season_year);
  GET DIAGNOSTICS v_teams = ROW_COUNT;

  SELECT count(*) INTO v_players
  FROM public.member_league_registrations r
  JOIN public.leagues l ON l.id = r.league_id
  WHERE l.club_id = _club_id AND l.association_id = _association_id
    AND (_season_year IS NULL OR l.season_year IS NOT DISTINCT FROM _season_year);

  RETURN QUERY SELECT v_teams, v_players;
END;
$$;

REVOKE ALL ON FUNCTION public.club_submit_association_roster(uuid, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.club_submit_association_roster(uuid, uuid, integer) TO authenticated, service_role;
