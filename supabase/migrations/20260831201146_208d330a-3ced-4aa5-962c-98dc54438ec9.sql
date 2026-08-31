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
  email_reach_count integer
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
             WHERE NULLIF(TRIM(COALESCE(m.email, '')), '') IS NOT NULL
                OR NULLIF(TRIM(COALESCE(p.email, '')), '') IS NOT NULL
           )::int AS email_reach
    FROM public.club_members m
    LEFT JOIN public.profiles p ON p.id = m.user_id
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
         COALESCE(k.email_reach, 0)
  FROM eligible e
  JOIN public.clubs c ON c.id = e.cid
  LEFT JOIN assoc a ON a.cid = c.id
  LEFT JOIN counts k ON k.cid = c.id
  ORDER BY (c.id = _club) DESC, COALESCE(a.aname, 'Unaffiliated clubs'), c.name;
END;
$$;

REVOKE ALL ON FUNCTION public.tournament_invite_scope_tree(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tournament_invite_scope_tree(uuid, uuid, text) TO authenticated;