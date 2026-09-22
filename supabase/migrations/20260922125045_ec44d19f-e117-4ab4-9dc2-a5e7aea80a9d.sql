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
  _is_assoc_tenant boolean := false;
BEGIN
  _scope := COALESCE(_scope, 'club');

  SELECT (c.tenant_type = 'association') INTO _is_assoc_tenant
  FROM public.clubs c WHERE c.id = _club_id;
  _is_assoc_tenant := COALESCE(_is_assoc_tenant, false);

  IF _owner IS NULL AND _club_id IS NOT NULL THEN
    SELECT o.id INTO _owner FROM public.organisations o
    WHERE o.kind = 'club' AND o.club_id = _club_id LIMIT 1;

    -- The tenant is itself an association (e.g. a regional league running its
    -- own events): use its association organisation as the owning body.
    IF _owner IS NULL AND _is_assoc_tenant THEN
      SELECT o.id INTO _owner
      FROM public.organisations o
      JOIN public.league_associations la ON la.id = o.league_association_id
      WHERE o.kind = 'association' AND la.tenant_association_id = _club_id
      LIMIT 1;
    END IF;
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
      -- (d) the organiser IS the association: its own affiliated clubs
      SELECT DISTINCT ac.club_id
      FROM public.association_affiliated_clubs ac
      WHERE ac.association_tenant_id = _club_id
        AND COALESCE(ac.status, 'active') = 'active'
        AND ac.club_id IS NOT NULL
      UNION
      -- (e) clubs whose league record points at this association tenant
      SELECT DISTINCT la5.club_id
      FROM public.league_associations la5
      WHERE la5.tenant_association_id = _club_id
        AND la5.club_id IS NOT NULL
      UNION
      -- (f) clubs playing in the regional league(s) this association runs
      SELECT DISTINCT la7.club_id
      FROM public.league_associations la7
      WHERE la7.club_id IS NOT NULL
        AND la7.platform_association_id IN (
          SELECT la6.platform_association_id
          FROM public.league_associations la6
          WHERE la6.tenant_association_id = _club_id
            AND la6.platform_association_id IS NOT NULL
          UNION
          SELECT o.platform_association_id
          FROM public.organisations o
          WHERE o.id = _owner AND o.platform_association_id IS NOT NULL
        )
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
$function$;