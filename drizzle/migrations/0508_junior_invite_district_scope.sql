-- Junior bodies (zone / district) run tournaments for the clubs grouped under them.
-- Those clubs live in `org_groupings`, never in `organisation_relationships`, so the
-- invitation scope and the invitation club picker must resolve them through the grouping tree.

-- 1. Which clubs are in scope for a tournament.
CREATE OR REPLACE FUNCTION public.scope_eligible_club_ids(_club_id uuid, _owner_org_id uuid, _scope text)
 RETURNS TABLE(club_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _owner uuid := _owner_org_id;
  _assoc uuid;
  _root uuid;
  _grp uuid;
  _kind text;
BEGIN
  _scope := COALESCE(_scope, 'club');
  IF _owner IS NULL AND _club_id IS NOT NULL THEN
    SELECT o.id INTO _owner FROM public.organisations o
    WHERE o.kind = 'club' AND o.club_id = _club_id LIMIT 1;
    IF _owner IS NULL THEN
      SELECT o.id INTO _owner FROM public.organisations o
      JOIN public.league_associations la ON la.id = o.league_association_id
      JOIN public.clubs c ON c.id = la.tenant_association_id
      WHERE o.kind = 'association' AND c.tenant_type = 'association'
        AND la.tenant_association_id = _club_id LIMIT 1;
    END IF;
    -- A junior body workspace is a zone/district organisation, not a club organisation.
    IF _owner IS NULL THEN
      SELECT o.id INTO _owner FROM public.organisations o
      WHERE o.club_id = _club_id AND o.kind IN ('zone','provincial') LIMIT 1;
    END IF;
  END IF;

  SELECT o.kind::text INTO _kind FROM public.organisations o WHERE o.id = _owner;

  IF _scope = 'club' THEN
    RETURN QUERY SELECT c.id FROM public.clubs c
      WHERE c.id = _club_id OR c.id = (SELECT o.club_id FROM public.organisations o WHERE o.id = _owner);
    RETURN;
  END IF;

  IF _scope IN ('provincial','zone') THEN
    -- Grouping scopes resolve only through an owning zone/provincial organisation; fail closed otherwise.
    IF _kind = 'provincial' AND _scope = 'provincial' THEN _grp := _owner;
    ELSIF _kind = 'zone' AND _scope = 'zone' THEN _grp := _owner;
    ELSIF _kind = 'provincial' AND _scope = 'zone' THEN
      SELECT gr.parent_org_id INTO _grp FROM public.org_groupings gr
      JOIN public.organisations z ON z.id = gr.parent_org_id
      WHERE gr.child_org_id = _owner AND gr.mode = 'include' AND z.kind::text = 'zone' LIMIT 1;
    END IF;
    IF _grp IS NOT NULL THEN
      RETURN QUERY SELECT g.club_id FROM public.org_grouping_club_ids(_grp) g;
    ELSIF _club_id IS NOT NULL THEN
      RETURN QUERY SELECT c.id FROM public.clubs c WHERE c.id = _club_id;
    END IF;
    RETURN;
  END IF;

  IF _scope = 'association' THEN
    -- A junior body's own tree is its grouping: the districts and clubs linked under it.
    IF _kind IN ('zone','provincial') THEN
      RETURN QUERY
        SELECT g.club_id FROM public.org_grouping_club_ids(_owner) g
        UNION
        SELECT c.id FROM public.clubs c WHERE c.id = _club_id;
      RETURN;
    END IF;
    SELECT CASE WHEN o.kind = 'association' THEN o.id ELSE public.org_owning_association(_owner) END
      INTO _assoc FROM public.organisations o WHERE o.id = _owner;
    IF _assoc IS NOT NULL THEN
      RETURN QUERY SELECT DISTINCT o.club_id
        FROM public.org_descendants(_assoc) d
        JOIN public.organisations o ON o.id = d.org_id
        WHERE o.kind = 'club' AND o.club_id IS NOT NULL;
    ELSIF _club_id IS NOT NULL THEN
      RETURN QUERY SELECT c.id FROM public.clubs c WHERE c.id = _club_id;
    END IF;
    RETURN;
  END IF;

  _root := public.org_federation_root(_owner);
  RETURN QUERY SELECT DISTINCT o.club_id
    FROM public.org_descendants(_root) d
    JOIN public.organisations o ON o.id = d.org_id
    WHERE o.kind = 'club' AND o.club_id IS NOT NULL
    UNION
    SELECT o.club_id FROM public.organisations o
    WHERE o.kind = 'club' AND o.club_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.organisation_relationships r
        WHERE r.child_org_id = o.id AND (r.effective_to IS NULL OR r.effective_to >= CURRENT_DATE))
    UNION
    SELECT c.id FROM public.clubs c
    WHERE NOT EXISTS (SELECT 1 FROM public.organisations o WHERE o.club_id = c.id)
    -- A junior body's national event reaches every club grouped under the federation's zones.
    UNION
    SELECT g.club_id FROM public.org_grouping_club_ids(_root) g WHERE _kind IN ('zone','provincial');
END;
$function$;

-- 2. The invitation club picker: show junior clubs under the district/zone they are grouped in.
CREATE OR REPLACE FUNCTION public.tournament_invite_scope_tree(p_tournament_id uuid DEFAULT NULL::uuid, p_club_id uuid DEFAULT NULL::uuid, p_scope text DEFAULT NULL::text)
 RETURNS TABLE(association_id uuid, association_name text, club_id uuid, club_name text, is_own_club boolean, member_count integer, registered_count integer, email_count integer, has_members boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _club uuid := p_club_id;
  _owner uuid;
  _scope text := p_scope;
  _saved text;
  _junior boolean := false;
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
  SELECT EXISTS (
    SELECT 1 FROM public.organisations o
    WHERE o.id = _owner AND o.kind IN ('zone','provincial')
  ) INTO _junior;

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
  -- Junior clubs are offered under the district (provincial) they are grouped in,
  -- falling back to the zone when a district does not claim them.
  district AS (
    SELECT DISTINCT ON (l.cid) l.cid, lo.id AS jid, lo.name AS jname
    FROM (
      SELECT lvl.id AS lid, gc.club_id AS cid
      FROM public.organisations lvl
      JOIN LATERAL public.org_grouping_club_ids(lvl.id) gc ON true
      WHERE lvl.kind IN ('zone','provincial') AND _junior
    ) l
    JOIN public.organisations lo ON lo.id = l.lid
    ORDER BY l.cid, (lo.kind = 'provincial') DESC, lo.name
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
  SELECT COALESCE(CASE WHEN _junior THEN d.jid END, a.aid),
         COALESCE(CASE WHEN _junior THEN d.jname END, a.aname, 'Unaffiliated clubs')::text,
         c.id,
         COALESCE(c.name, 'Unnamed club')::text,
         (c.id = _club),
         COALESCE(k.members, 0),
         COALESCE(k.registered, 0),
         COALESCE(k.reachable, 0),
         (COALESCE(k.reachable, 0) > 0)
  FROM eligible e
  JOIN public.clubs c ON c.id = e.cid
  LEFT JOIN assoc a ON a.cid = c.id
  LEFT JOIN district d ON d.cid = c.id
  LEFT JOIN counts k ON k.cid = c.id
  -- For association/regional-league scope, only show clubs actually linked to an association or district.
  WHERE _scope <> 'association' OR a.aid IS NOT NULL OR ( _junior AND d.jid IS NOT NULL)
  ORDER BY (c.id = _club) DESC,
           COALESCE(CASE WHEN _junior THEN d.jname END, a.aname, 'Unaffiliated clubs'),
           c.name;
END;
$function$;
