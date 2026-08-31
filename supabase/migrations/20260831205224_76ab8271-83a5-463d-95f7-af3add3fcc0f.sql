-- 1. Directory: only email-reachable members are listed
DROP FUNCTION IF EXISTS public.tournament_invite_directory(uuid, uuid, text, text, integer, uuid[]);

CREATE OR REPLACE FUNCTION public.tournament_invite_directory(
  p_tournament_id uuid DEFAULT NULL,
  p_club_id uuid DEFAULT NULL,
  p_scope text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 200,
  p_club_ids uuid[] DEFAULT NULL
)
RETURNS TABLE(
  member_id uuid,
  display_name text,
  club_id uuid,
  club_name text,
  gender text,
  ladder_position integer,
  ranking_points numeric,
  is_own_club boolean,
  invite_status text,
  is_user boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _club uuid := p_club_id;
  _owner uuid;
  _scope text := p_scope;
  _q text := NULLIF(BTRIM(COALESCE(p_search, '')), '');
  _lim integer := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  IF p_tournament_id IS NOT NULL THEN
    SELECT t.club_id, t.owner_org_id INTO _club, _owner
    FROM public.tournaments t WHERE t.id = p_tournament_id;
    IF _club IS NULL AND _owner IS NULL THEN
      RAISE EXCEPTION 'Tournament not found';
    END IF;
    SELECT g.eligibility_scope INTO _scope
    FROM public.tournament_governance g WHERE g.tournament_id = p_tournament_id;
  ELSIF _club IS NULL THEN
    RAISE EXCEPTION 'A club or tournament is required';
  END IF;

  IF NOT public.can_browse_invite_directory(_uid, p_tournament_id, _club) THEN
    RAISE EXCEPTION 'Not authorised to browse the player directory for this tournament';
  END IF;

  _scope := COALESCE(_scope, p_scope, 'club');

  RETURN QUERY
  SELECT
    m.id,
    COALESCE(NULLIF(BTRIM(m.name), ''), 'Unknown player')::text,
    m.club_id,
    COALESCE(c.name, '')::text,
    m.gender,
    m.ladder_position,
    m.ranking_points,
    (m.club_id = _club),
    r.status::text,
    (m.user_id IS NOT NULL)
  FROM public.club_members m
  JOIN public.scope_eligible_club_ids(_club, _owner, _scope) e ON e.club_id = m.club_id
  LEFT JOIN public.clubs c ON c.id = m.club_id
  LEFT JOIN public.club_champs_registrations r
         ON p_tournament_id IS NOT NULL
        AND r.champ_id = p_tournament_id
        AND r.club_member_id = m.id
  WHERE m.status = 'active'
    AND m.role <> 'visitor'
    AND COALESCE(m.billing_exempt, false) = false
    -- Only members who can actually be reached: email on file or a linked login
    AND (m.user_id IS NOT NULL OR NULLIF(BTRIM(COALESCE(m.email, '')), '') IS NOT NULL)
    AND (p_club_ids IS NULL OR m.club_id = ANY(p_club_ids))
    AND (_q IS NULL OR m.name ILIKE '%' || _q || '%' OR COALESCE(c.name, '') ILIKE '%' || _q || '%')
  ORDER BY (m.club_id = _club) DESC, COALESCE(c.name, ''), m.ladder_position NULLS LAST, m.name
  LIMIT _lim;
END;
$$;

REVOKE ALL ON FUNCTION public.tournament_invite_directory(uuid, uuid, text, text, integer, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tournament_invite_directory(uuid, uuid, text, text, integer, uuid[]) TO authenticated;

-- 2. Scope tree: per-club email-reachable count alongside total members
DROP FUNCTION IF EXISTS public.tournament_invite_scope_tree(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.tournament_invite_scope_tree(
  p_tournament_id uuid DEFAULT NULL,
  p_club_id uuid DEFAULT NULL,
  p_scope text DEFAULT NULL
)
RETURNS TABLE(
  association_id uuid,
  association_name text,
  club_id uuid,
  club_name text,
  is_own_club boolean,
  member_count integer,
  registered_count integer,
  email_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _club uuid := p_club_id;
  _owner uuid;
  _scope text := p_scope;
  _saved text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  IF p_tournament_id IS NOT NULL THEN
    SELECT t.club_id, t.owner_org_id INTO _club, _owner
    FROM public.tournaments t WHERE t.id = p_tournament_id;
    SELECT g.eligibility_scope INTO _saved
    FROM public.tournament_governance g WHERE g.tournament_id = p_tournament_id;
    -- The caller's scope wins so the wizard can preview a scope before saving.
    _scope := COALESCE(p_scope, _saved);
  END IF;

  IF NOT public.can_browse_invite_directory(_uid, p_tournament_id, _club) THEN
    RAISE EXCEPTION 'Not authorised to browse the invitation scope for this tournament';
  END IF;

  _scope := COALESCE(_scope, 'club');

  RETURN QUERY
  WITH eligible AS (
    SELECT e.club_id AS cid FROM public.scope_eligible_club_ids(_club, _owner, _scope) e
  ),
  assoc AS (
    SELECT DISTINCT ON (la.club_id)
      la.club_id AS cid, pla.id AS aid, pla.name AS aname
    FROM public.league_associations la
    JOIN public.platform_league_associations pla ON pla.id = la.platform_association_id
    WHERE la.club_id IN (SELECT cid FROM eligible)
    ORDER BY la.club_id, pla.name
  ),
  counts AS (
    SELECT m.club_id AS cid,
           COUNT(*)::int AS members,
           COUNT(*) FILTER (WHERE r.id IS NOT NULL)::int AS registered,
           COUNT(*) FILTER (
             WHERE m.user_id IS NOT NULL
                OR NULLIF(BTRIM(COALESCE(m.email, '')), '') IS NOT NULL
           )::int AS reachable
    FROM public.club_members m
    LEFT JOIN public.club_champs_registrations r
      ON p_tournament_id IS NOT NULL
     AND r.champ_id = p_tournament_id
     AND r.club_member_id = m.id
    WHERE m.club_id IN (SELECT cid FROM eligible)
      AND m.status = 'active'
      AND m.role <> 'visitor'
      AND COALESCE(m.billing_exempt, false) = false
    GROUP BY m.club_id
  )
  SELECT a.aid,
         COALESCE(a.aname, 'Unaffiliated clubs')::text,
         c.id,
         COALESCE(c.name, 'Unnamed club')::text,
         (c.id = _club),
         COALESCE(k.members, 0),
         COALESCE(k.registered, 0),
         COALESCE(k.reachable, 0)
  FROM eligible e
  JOIN public.clubs c ON c.id = e.cid
  LEFT JOIN assoc a ON a.cid = c.id
  LEFT JOIN counts k ON k.cid = c.id
  ORDER BY (c.id = _club) DESC, COALESCE(a.aname, 'Unaffiliated clubs'), c.name;
END;
$$;

REVOKE ALL ON FUNCTION public.tournament_invite_scope_tree(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tournament_invite_scope_tree(uuid, uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';