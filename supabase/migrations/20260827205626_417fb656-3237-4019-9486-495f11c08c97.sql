-- 1) Federation tree -> affiliated clubs sync
CREATE OR REPLACE FUNCTION public.sync_association_clubs_from_federation(_tenant_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count integer := 0;
BEGIN
  WITH assoc AS (
    SELECT c.id AS tenant_id, o.id AS org_id
    FROM public.clubs c
    JOIN public.league_associations la ON la.tenant_association_id = c.id
    JOIN public.organisations o ON o.league_association_id = la.id
    WHERE c.tenant_type = 'association'
      AND (_tenant_id IS NULL OR c.id = _tenant_id)
      AND COALESCE(o.is_internal_league, false) = false
  ), tree AS (
    SELECT DISTINCT a.tenant_id, child.club_id
    FROM assoc a
    JOIN public.organisation_relationships r ON r.parent_org_id = a.org_id
      AND (r.effective_to IS NULL OR r.effective_to >= CURRENT_DATE)
    JOIN public.organisations child ON child.id = r.child_org_id
    WHERE child.kind = 'club' AND child.club_id IS NOT NULL
      AND child.club_id <> a.tenant_id
  ), ins AS (
    INSERT INTO public.association_affiliated_clubs (association_tenant_id, club_id, status)
    SELECT t.tenant_id, t.club_id, 'active' FROM tree t
    ON CONFLICT (association_tenant_id, club_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM ins;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_association_clubs_from_federation(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_association_clubs_from_federation(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.trg_sync_assoc_clubs_from_federation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.sync_association_clubs_from_federation(NULL);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_org_rel_sync_assoc_clubs ON public.organisation_relationships;
CREATE TRIGGER trg_org_rel_sync_assoc_clubs
AFTER INSERT OR UPDATE ON public.organisation_relationships
FOR EACH STATEMENT EXECUTE FUNCTION public.trg_sync_assoc_clubs_from_federation();

-- 2) Association leagues: only this association's own leagues (never internal club leagues)
CREATE OR REPLACE FUNCTION public.association_league_teams(_tenant_id uuid, _season_year integer DEFAULT NULL)
RETURNS TABLE(team_id uuid, team_name text, team_code text, level integer, is_reserve boolean, category text,
              season_year integer, club_id uuid, club_name text, created_by_association boolean, player_count bigint)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_association_admin(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'Not an association admin';
  END IF;
  RETURN QUERY
  SELECT l.id, l.name, l.code, l.level, COALESCE(l.is_reserve, false),
         l.category, l.season_year, c.id, c.name,
         l.created_by_association_id IS NOT NULL,
         (SELECT count(*) FROM public.member_league_registrations r WHERE r.league_id = l.id)
  FROM public.leagues l
  JOIN public.clubs c ON c.id = l.club_id
  JOIN public.association_affiliated_clubs a
    ON a.club_id = l.club_id AND a.association_tenant_id = _tenant_id AND a.status = 'active'
  LEFT JOIN public.league_associations la ON la.id = l.association_id
  WHERE l.archived_at IS NULL
    AND (_season_year IS NULL OR l.season_year IS NOT DISTINCT FROM _season_year)
    AND (
      l.created_by_association_id = _tenant_id
      OR la.tenant_association_id = _tenant_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.association_league_teams(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.association_league_teams(uuid, integer) TO authenticated, service_role;

-- 3) Association-created teams attach to the association's own league association
CREATE OR REPLACE FUNCTION public.association_create_team(
  _tenant_id uuid, _club_id uuid, _name text, _code text DEFAULT NULL,
  _level integer DEFAULT NULL, _category text DEFAULT NULL,
  _is_reserve boolean DEFAULT false, _season_year integer DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid; v_assoc uuid;
BEGIN
  IF NOT public.is_association_admin(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'Not an association admin';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.association_affiliated_clubs a
    WHERE a.club_id = _club_id AND a.association_tenant_id = _tenant_id AND a.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Club is not affiliated with this association';
  END IF;

  SELECT la.id INTO v_assoc FROM public.league_associations la
   WHERE la.club_id = _club_id AND la.tenant_association_id = _tenant_id
   LIMIT 1;

  IF v_assoc IS NULL THEN
    INSERT INTO public.league_associations (club_id, name, scope, tenant_association_id, active)
    SELECT _club_id, c.name, 'region', _tenant_id, true
    FROM public.clubs c WHERE c.id = _tenant_id
    RETURNING id INTO v_assoc;
  END IF;

  INSERT INTO public.leagues (club_id, association_id, name, code, level, category, is_reserve, season_year, created_by_association_id)
  VALUES (_club_id, v_assoc, _name, NULLIF(_code, ''), _level, NULLIF(_category, ''), COALESCE(_is_reserve, false), _season_year, _tenant_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.association_create_team(uuid, uuid, text, text, integer, text, boolean, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.association_create_team(uuid, uuid, text, text, integer, text, boolean, integer) TO authenticated, service_role;