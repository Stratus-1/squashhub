-- 1. Regional scope must follow PARTICIPATION, not ownership.
CREATE OR REPLACE FUNCTION public.scope_eligible_club_ids(
  _club_id uuid,
  _owner_org_id uuid,
  _scope text
)
RETURNS TABLE(club_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _owner uuid := _owner_org_id;
  _assoc uuid;
  _root uuid;
BEGIN
  _scope := COALESCE(_scope, 'club');

  IF _owner IS NULL AND _club_id IS NOT NULL THEN
    SELECT o.id INTO _owner FROM public.organisations o
    WHERE o.kind = 'club' AND o.club_id = _club_id LIMIT 1;
  END IF;

  IF _scope = 'club' THEN
    RETURN QUERY
      SELECT c.id FROM public.clubs c
      WHERE c.id = _club_id
         OR c.id = (SELECT o.club_id FROM public.organisations o WHERE o.id = _owner);
    RETURN;
  END IF;

  IF _scope = 'association' THEN
    SELECT CASE
      WHEN (SELECT o.kind FROM public.organisations o WHERE o.id = _owner) = 'association'
        THEN _owner
      ELSE public.org_owning_association(_owner)
    END INTO _assoc;

    RETURN QUERY
      -- (a) clubs under the owning association in the org hierarchy
      SELECT DISTINCT o.club_id
      FROM public.org_descendants(COALESCE(_assoc, '00000000-0000-0000-0000-000000000000'::uuid)) d
      JOIN public.organisations o ON o.id = d.org_id
      WHERE o.kind = 'club' AND o.club_id IS NOT NULL
      UNION
      -- (b) PARTICIPATION: clubs that play in a regional league this club plays in
      SELECT DISTINCT la2.club_id
      FROM public.league_associations la1
      JOIN public.league_associations la2
        ON la2.platform_association_id = la1.platform_association_id
      WHERE la1.club_id = _club_id
        AND la1.platform_association_id IS NOT NULL
        AND la2.club_id IS NOT NULL
      UNION
      SELECT DISTINCT la4.club_id
      FROM public.league_associations la3
      JOIN public.league_associations la4
        ON la4.tenant_association_id = la3.tenant_association_id
      WHERE la3.club_id = _club_id
        AND la3.tenant_association_id IS NOT NULL
        AND la4.club_id IS NOT NULL
      UNION
      -- (c) clubs affiliated to an association tenant this club is affiliated to
      SELECT DISTINCT ac2.club_id
      FROM public.association_affiliated_clubs ac1
      JOIN public.association_affiliated_clubs ac2
        ON ac2.association_tenant_id = ac1.association_tenant_id
      WHERE ac1.club_id = _club_id
        AND COALESCE(ac2.status, 'active') = 'active'
      UNION
      SELECT c.id FROM public.clubs c WHERE c.id = _club_id;
    RETURN;
  END IF;

  _root := public.org_federation_root(_owner);

  RETURN QUERY
    SELECT DISTINCT o.club_id
    FROM public.org_descendants(_root) d
    JOIN public.organisations o ON o.id = d.org_id
    WHERE o.kind = 'club' AND o.club_id IS NOT NULL
    UNION
    SELECT o.club_id
    FROM public.organisations o
    WHERE o.kind = 'club' AND o.club_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.organisation_relationships r
        WHERE r.child_org_id = o.id
          AND (r.effective_to IS NULL OR r.effective_to >= CURRENT_DATE)
      )
    UNION
    SELECT c.id FROM public.clubs c
    WHERE NOT EXISTS (SELECT 1 FROM public.organisations o2 WHERE o2.club_id = c.id);
END;
$$;

-- 2. Organiser guard shared by the new helpers.
CREATE OR REPLACE FUNCTION public.can_browse_invite_directory(_uid uuid, _tournament_id uuid, _club_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _uid IS NULL THEN false
    WHEN _tournament_id IS NOT NULL THEN public.can_manage_tournament(_uid, _tournament_id)
    WHEN _club_id IS NOT NULL THEN (
      public.is_platform_admin(_uid) OR public.is_club_admin_or_permitted(_uid, _club_id, 'champs')
    )
    ELSE false
  END;
$$;

REVOKE ALL ON FUNCTION public.can_browse_invite_directory(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_browse_invite_directory(uuid, uuid, uuid) TO authenticated, service_role;

-- 3. Association -> club tree with counts only (no personal data).
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
  registered_count integer
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
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  IF p_tournament_id IS NOT NULL THEN
    SELECT t.club_id, t.owner_org_id INTO _club, _owner
    FROM public.tournaments t WHERE t.id = p_tournament_id;
    SELECT g.eligibility_scope INTO _scope
    FROM public.tournament_governance g WHERE g.tournament_id = p_tournament_id;
  END IF;

  IF NOT public.can_browse_invite_directory(_uid, p_tournament_id, _club) THEN
    RAISE EXCEPTION 'Not authorised to browse the invitation scope for this tournament';
  END IF;

  _scope := COALESCE(_scope, p_scope, 'club');

  RETURN QUERY
  WITH eligible AS (
    SELECT e.club_id FROM public.scope_eligible_club_ids(_club, _owner, _scope) e
  ),
  assoc AS (
    SELECT DISTINCT ON (la.club_id)
      la.club_id, pla.id AS aid, pla.name AS aname
    FROM public.league_associations la
    JOIN public.platform_league_associations pla ON pla.id = la.platform_association_id
    WHERE la.club_id IN (SELECT club_id FROM eligible)
    ORDER BY la.club_id, pla.name
  ),
  counts AS (
    SELECT m.club_id,
           COUNT(*)::int AS members,
           COUNT(*) FILTER (WHERE r.id IS NOT NULL)::int AS registered
    FROM public.club_members m
    LEFT JOIN public.club_champs_registrations r
      ON p_tournament_id IS NOT NULL
     AND r.champ_id = p_tournament_id
     AND r.club_member_id = m.id
    WHERE m.club_id IN (SELECT club_id FROM eligible)
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
         COALESCE(k.registered, 0)
  FROM eligible e
  JOIN public.clubs c ON c.id = e.club_id
  LEFT JOIN assoc a ON a.club_id = c.id
  LEFT JOIN counts k ON k.club_id = c.id
  ORDER BY (c.id = _club) DESC, COALESCE(a.aname, 'Unaffiliated clubs'), c.name;
END;
$$;

REVOKE ALL ON FUNCTION public.tournament_invite_scope_tree(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tournament_invite_scope_tree(uuid, uuid, text) TO authenticated;

-- 4. Member references only, for the clubs the organiser ticked.
CREATE OR REPLACE FUNCTION public.tournament_invite_member_ids(
  p_tournament_id uuid DEFAULT NULL,
  p_club_id uuid DEFAULT NULL,
  p_scope text DEFAULT NULL,
  p_club_ids uuid[] DEFAULT NULL
)
RETURNS TABLE(member_id uuid, club_id uuid)
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
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

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
  SELECT m.id, m.club_id
  FROM public.club_members m
  JOIN public.scope_eligible_club_ids(_club, _owner, _scope) e ON e.club_id = m.club_id
  WHERE m.status = 'active'
    AND m.role <> 'visitor'
    AND COALESCE(m.billing_exempt, false) = false
    AND (p_club_ids IS NULL OR m.club_id = ANY(p_club_ids));
END;
$$;

REVOKE ALL ON FUNCTION public.tournament_invite_member_ids(uuid, uuid, text, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tournament_invite_member_ids(uuid, uuid, text, uuid[]) TO authenticated;

-- 5. Narrow the player search to the ticked clubs (safe projection unchanged).
DROP FUNCTION IF EXISTS public.tournament_invite_directory(uuid, uuid, text, text, integer);

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
  invite_status text
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
    r.status::text
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
    AND (p_club_ids IS NULL OR m.club_id = ANY(p_club_ids))
    AND (_q IS NULL OR m.name ILIKE '%' || _q || '%' OR COALESCE(c.name, '') ILIKE '%' || _q || '%')
  ORDER BY (m.club_id = _club) DESC, COALESCE(c.name, ''), m.ladder_position NULLS LAST, m.name
  LIMIT _lim;
END;
$$;

REVOKE ALL ON FUNCTION public.tournament_invite_directory(uuid, uuid, text, text, integer, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tournament_invite_directory(uuid, uuid, text, text, integer, uuid[]) TO authenticated;

-- 6. Remember the ticked clubs on the tournament.
ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS invite_audience_club_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];