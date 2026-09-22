CREATE OR REPLACE FUNCTION public.scope_eligible_club_ids(_club_id uuid, _owner_org_id uuid, _scope text)
RETURNS TABLE(club_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  _owner uuid := _owner_org_id;
  _assoc uuid;
  _root uuid;
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
  END IF;

  IF _scope = 'club' THEN
    RETURN QUERY SELECT c.id FROM public.clubs c
      WHERE c.id = _club_id OR c.id = (SELECT o.club_id FROM public.organisations o WHERE o.id = _owner);
    RETURN;
  END IF;

  IF _scope = 'association' THEN
    SELECT CASE WHEN o.kind = 'association' THEN o.id ELSE public.org_owning_association(_owner) END
      INTO _assoc FROM public.organisations o WHERE o.id = _owner;
    -- Federation relationships are authoritative. Legacy league participation
    -- and affiliation rows must not extend the regional entrant population.
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
    WHERE NOT EXISTS (SELECT 1 FROM public.organisations o WHERE o.club_id = c.id);
END;
$function$;
REVOKE ALL ON FUNCTION public.scope_eligible_club_ids(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scope_eligible_club_ids(uuid, uuid, text) TO authenticated, service_role;