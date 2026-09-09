CREATE OR REPLACE FUNCTION public.tournament_invite_league_tree(
  p_tournament_id uuid DEFAULT NULL,
  p_club_id uuid DEFAULT NULL,
  p_scope text DEFAULT NULL
)
RETURNS TABLE(
  league_id uuid,
  league_name text,
  level integer,
  season_year integer,
  is_reserve boolean,
  club_id uuid,
  club_name text,
  association_name text,
  player_count integer,
  contactable_count integer
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _club uuid := p_club_id;
  _owner uuid;
  _scope text := p_scope;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  IF p_tournament_id IS NOT NULL THEN
    SELECT t.club_id, t.owner_org_id INTO _club, _owner
    FROM public.tournaments t WHERE t.id = p_tournament_id;
    SELECT g.eligibility_scope INTO _scope
    FROM public.tournament_governance g WHERE g.tournament_id = p_tournament_id;
  END IF;

  IF NOT public.can_browse_invite_directory(_uid, p_tournament_id, _club) THEN
    RAISE EXCEPTION 'Not authorised to browse league teams for this tournament';
  END IF;

  _scope := COALESCE(_scope, p_scope, 'club');

  RETURN QUERY
  SELECT
    l.id,
    l.name::text,
    l.level,
    l.season_year,
    COALESCE(l.is_reserve, false),
    c.id,
    c.name::text,
    la.name::text,
    COUNT(m.id)::int,
    COUNT(m.id) FILTER (
      WHERE COALESCE(NULLIF(TRIM(m.email), ''), NULLIF(TRIM(m.phone), '')) IS NOT NULL
    )::int
  FROM public.leagues l
  JOIN public.scope_eligible_club_ids(_club, _owner, _scope) e ON e.club_id = l.club_id
  JOIN public.clubs c ON c.id = l.club_id
  LEFT JOIN public.league_associations la ON la.id = l.association_id
  LEFT JOIN public.member_league_registrations r ON r.league_id = l.id
  LEFT JOIN public.club_members m
    ON m.id = r.club_member_id
   AND m.status = 'active'
   AND m.role <> 'visitor'
   AND COALESCE(m.billing_exempt, false) = false
  WHERE l.archived_at IS NULL
  GROUP BY l.id, l.name, l.level, l.season_year, l.is_reserve, c.id, c.name, la.name
  ORDER BY l.season_year DESC NULLS LAST, l.level NULLS LAST, c.name, l.name;
END;
$function$;

REVOKE ALL ON FUNCTION public.tournament_invite_league_tree(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tournament_invite_league_tree(uuid, uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.tournament_invite_league_member_ids(
  p_tournament_id uuid DEFAULT NULL,
  p_club_id uuid DEFAULT NULL,
  p_scope text DEFAULT NULL,
  p_league_ids uuid[] DEFAULT NULL,
  p_include_reserves boolean DEFAULT true,
  p_contactable_only boolean DEFAULT true
)
RETURNS TABLE(member_id uuid, club_id uuid, league_id uuid, is_reserve boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _club uuid := p_club_id;
  _owner uuid;
  _scope text := p_scope;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_league_ids IS NULL OR array_length(p_league_ids, 1) IS NULL THEN RETURN; END IF;

  IF p_tournament_id IS NOT NULL THEN
    SELECT t.club_id, t.owner_org_id INTO _club, _owner
    FROM public.tournaments t WHERE t.id = p_tournament_id;
    SELECT g.eligibility_scope INTO _scope
    FROM public.tournament_governance g WHERE g.tournament_id = p_tournament_id;
  END IF;

  IF NOT public.can_browse_invite_directory(_uid, p_tournament_id, _club) THEN
    RAISE EXCEPTION 'Not authorised to resolve the invitation audience';
  END IF;

  _scope := COALESCE(_scope, p_scope, 'club');

  RETURN QUERY
  SELECT DISTINCT m.id, m.club_id, r.league_id, r.is_reserve
  FROM public.member_league_registrations r
  JOIN public.leagues l ON l.id = r.league_id
  JOIN public.scope_eligible_club_ids(_club, _owner, _scope) e ON e.club_id = l.club_id
  JOIN public.club_members m ON m.id = r.club_member_id
  WHERE r.league_id = ANY(p_league_ids)
    AND l.archived_at IS NULL
    AND m.status = 'active'
    AND m.role <> 'visitor'
    AND COALESCE(m.billing_exempt, false) = false
    AND (p_include_reserves OR NOT COALESCE(r.is_reserve, false))
    AND (
      NOT p_contactable_only
      OR COALESCE(NULLIF(TRIM(m.email), ''), NULLIF(TRIM(m.phone), '')) IS NOT NULL
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.tournament_invite_league_member_ids(uuid, uuid, text, uuid[], boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tournament_invite_league_member_ids(uuid, uuid, text, uuid[], boolean, boolean) TO authenticated;