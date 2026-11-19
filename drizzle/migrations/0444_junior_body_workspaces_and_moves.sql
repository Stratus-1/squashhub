-- Junior grouping management: tenant admins of a zone/provincial workspace manage grouping levels beneath them.
-- Grouping-descendant authority is limited to grouping levels (zone/provincial) so junior admins never gain senior association powers.
CREATE OR REPLACE FUNCTION public.federation_can_manage_org(_user_id uuid, _org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT _user_id IS NOT NULL AND _org_id IS NOT NULL AND (
    public.is_platform_admin(_user_id) OR public.is_national_admin(_user_id)
    OR EXISTS (
      SELECT 1 FROM public.organisation_admins a
      WHERE a.user_id = _user_id AND a.active
        AND a.role IN ('super_admin','association_admin','competition_admin')
        AND (_org_id IN (SELECT org_id FROM public.org_descendants(a.org_id))
          OR (EXISTS (SELECT 1 FROM public.organisations t WHERE t.id = _org_id AND t.kind::text IN ('zone','provincial'))
              AND _org_id IN (SELECT org_id FROM public.org_grouping_descendants(a.org_id)))))
    OR (public.federation_org_tenant(_org_id) IS NOT NULL
        AND public.is_club_admin(_user_id, public.federation_org_tenant(_org_id)))
    OR (EXISTS (SELECT 1 FROM public.organisations t WHERE t.id = _org_id AND t.kind::text IN ('zone','provincial'))
        AND EXISTS (
          SELECT 1 FROM public.organisations g
          WHERE g.kind::text = 'zone' AND g.active AND g.club_id IS NOT NULL AND g.id <> _org_id
            AND public.is_club_admin(_user_id, g.club_id)
            AND _org_id IN (SELECT org_id FROM public.org_grouping_descendants(g.id))))
  );
$function$;

-- Bring an association or club into a provincial association; a club leaves every other provincial in the same step.
CREATE OR REPLACE FUNCTION public.junior_move_org(_child_org_id uuid, _to_provincial_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); ck text; tk text; p record;
BEGIN
  IF NOT public.federation_can_manage_org(uid, _to_provincial_id) THEN
    RAISE EXCEPTION 'You can only bring clubs into a provincial association you manage.' USING ERRCODE = '42501';
  END IF;
  SELECT kind::text INTO tk FROM public.organisations WHERE id = _to_provincial_id AND active;
  IF tk IS DISTINCT FROM 'provincial' THEN RAISE EXCEPTION 'Choose a provincial association.'; END IF;
  SELECT kind::text INTO ck FROM public.organisations WHERE id = _child_org_id AND active;
  IF ck IS NULL OR ck NOT IN ('club','association') THEN RAISE EXCEPTION 'Only clubs or associations can be moved.'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('junior_move:' || _child_org_id::text));

  IF ck = 'association' THEN
    DELETE FROM public.org_groupings g USING public.organisations po
    WHERE g.child_org_id = _child_org_id AND g.mode = 'include' AND po.id = g.parent_org_id
      AND po.kind::text = 'provincial' AND g.parent_org_id <> _to_provincial_id;
    INSERT INTO public.org_groupings(parent_org_id, child_org_id, mode, created_by)
    VALUES (_to_provincial_id, _child_org_id, 'include', uid) ON CONFLICT (parent_org_id, child_org_id) DO NOTHING;
    RETURN;
  END IF;

  DELETE FROM public.org_groupings WHERE parent_org_id = _to_provincial_id AND child_org_id = _child_org_id AND mode = 'exclude';
  IF NOT EXISTS (SELECT 1 FROM public.org_grouping_descendants(_to_provincial_id) d WHERE d.org_id = _child_org_id) THEN
    INSERT INTO public.org_groupings(parent_org_id, child_org_id, mode, created_by)
    VALUES (_to_provincial_id, _child_org_id, 'include', uid) ON CONFLICT (parent_org_id, child_org_id) DO NOTHING;
  END IF;
  FOR p IN SELECT id FROM public.organisations WHERE kind::text = 'provincial' AND id <> _to_provincial_id LOOP
    DELETE FROM public.org_groupings WHERE parent_org_id = p.id AND child_org_id = _child_org_id AND mode = 'include';
    IF EXISTS (SELECT 1 FROM public.org_grouping_descendants(p.id) d WHERE d.org_id = _child_org_id) THEN
      INSERT INTO public.org_groupings(parent_org_id, child_org_id, mode, created_by)
      VALUES (p.id, _child_org_id, 'exclude', uid) ON CONFLICT (parent_org_id, child_org_id) DO NOTHING;
    END IF;
  END LOOP;
END $$;

-- Take an association or club out of a provincial association (a club inside a grouped association is left out).
CREATE OR REPLACE FUNCTION public.junior_remove_org(_child_org_id uuid, _provincial_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); ck text;
BEGIN
  IF NOT public.federation_can_manage_org(uid, _provincial_id) THEN
    RAISE EXCEPTION 'You can only remove clubs from a provincial association you manage.' USING ERRCODE = '42501';
  END IF;
  SELECT kind::text INTO ck FROM public.organisations WHERE id = _child_org_id;
  DELETE FROM public.org_groupings WHERE parent_org_id = _provincial_id AND child_org_id = _child_org_id AND mode = 'include';
  IF ck = 'club' AND EXISTS (SELECT 1 FROM public.org_grouping_descendants(_provincial_id) d WHERE d.org_id = _child_org_id) THEN
    INSERT INTO public.org_groupings(parent_org_id, child_org_id, mode, created_by)
    VALUES (_provincial_id, _child_org_id, 'exclude', uid) ON CONFLICT (parent_org_id, child_org_id) DO NOTHING;
  END IF;
END $$;

-- Create a new club (same shape as existing placeholder clubs) directly inside a provincial association.
CREATE OR REPLACE FUNCTION public.junior_create_club(_provincial_id uuid, _name text, _town text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); n text := btrim(coalesce(_name, '')); base text; sub text; i int := 1;
  pref text; v_club uuid; v_org uuid; tk text;
BEGIN
  IF NOT public.federation_can_manage_org(uid, _provincial_id) THEN
    RAISE EXCEPTION 'You can only create clubs in a provincial association you manage.' USING ERRCODE = '42501';
  END IF;
  SELECT kind::text INTO tk FROM public.organisations WHERE id = _provincial_id AND active;
  IF tk IS DISTINCT FROM 'provincial' THEN RAISE EXCEPTION 'Choose a provincial association.'; END IF;
  IF length(n) < 3 THEN RAISE EXCEPTION 'Enter the club''s full name.'; END IF;
  IF EXISTS (SELECT 1 FROM public.organisations WHERE kind::text = 'club' AND lower(btrim(name)) = lower(n))
     OR EXISTS (SELECT 1 FROM public.clubs WHERE lower(btrim(name)) = lower(n)) THEN
    RAISE EXCEPTION 'A club called "%" already exists. Search for it and bring it in instead.', n;
  END IF;
  base := left(lower(regexp_replace(n, '[^A-Za-z0-9]+', '', 'g')), 20);
  IF base = '' THEN base := 'club'; END IF;
  sub := base;
  WHILE EXISTS (SELECT 1 FROM public.clubs WHERE subdomain = sub) LOOP i := i + 1; sub := base || i; END LOOP;
  SELECT left(upper(string_agg(left(w, 1), '')), 4) INTO pref
    FROM regexp_split_to_table(regexp_replace(n, '[^A-Za-z0-9 ]+', ' ', 'g'), '\s+') w WHERE w <> '';

  INSERT INTO public.clubs(name, subdomain, tenant_type, member_number_prefix, created_by)
  VALUES (n, sub, 'club', coalesce(nullif(pref, ''), 'CLB'), uid) RETURNING id INTO v_club;
  INSERT INTO public.organisations(name, kind, club_id, country, active, metadata)
  VALUES (n, 'club', v_club, 'ZA', true, jsonb_strip_nulls(jsonb_build_object(
    'sportyhq_location', nullif(btrim(coalesce(_town, '')), ''),
    'created_via', 'junior_structure', 'created_from_org', _provincial_id, 'created_by', uid)))
  RETURNING id INTO v_org;
  INSERT INTO public.org_groupings(parent_org_id, child_org_id, mode, created_by)
  VALUES (_provincial_id, v_org, 'include', uid);
  RETURN v_org;
END $$;

-- Super Admin: open a workspace (login dashboard) for a zone or provincial association.
CREATE OR REPLACE FUNCTION public.federation_create_workspace(_org_id uuid, _subdomain text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE o record; sub text := lower(btrim(coalesce(_subdomain, ''))); v_club uuid;
BEGIN
  IF NOT (public.is_platform_admin(auth.uid()) OR public.is_national_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO o FROM public.organisations WHERE id = _org_id AND active FOR UPDATE;
  IF NOT FOUND OR o.kind::text NOT IN ('zone','provincial') THEN RAISE EXCEPTION 'Only zones and provincial associations get a workspace here.'; END IF;
  IF o.club_id IS NOT NULL THEN RETURN o.club_id; END IF;
  IF sub !~ '^[a-z0-9][a-z0-9-]{1,29}$' THEN RAISE EXCEPTION 'Use 2–30 letters, numbers or dashes for the web address.'; END IF;
  IF EXISTS (SELECT 1 FROM public.clubs WHERE subdomain = sub) THEN RAISE EXCEPTION 'That web address is already used.'; END IF;
  INSERT INTO public.clubs(name, subdomain, tenant_type, member_number_prefix, created_by)
  VALUES (o.name, sub, 'association', upper(coalesce(nullif(o.abbreviation, ''), left(sub, 4))), auth.uid())
  RETURNING id INTO v_club;
  UPDATE public.organisations SET club_id = v_club, updated_at = now() WHERE id = _org_id;
  RETURN v_club;
END $$;

-- Junior counts for one zone/provincial, for the admins who manage it (counts only, never dates of birth).
CREATE OR REPLACE FUNCTION public.org_junior_counts_for(_org_id uuid)
RETURNS TABLE(club_id uuid, juniors integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.federation_can_manage_org(auth.uid(), _org_id) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT cm.club_id, COUNT(*)::int
  FROM public.club_members cm
  LEFT JOIN public.people_private pp ON pp.person_id = cm.person_id
  WHERE cm.club_id IN (SELECT g.club_id FROM public.org_grouping_club_ids(_org_id) g)
    AND cm.status = 'active' AND cm.role <> 'visitor'
    AND COALESCE(
      EXTRACT(YEAR FROM age(CURRENT_DATE, pp.date_of_birth))::int,
      public._agm_age_from_sa_id(COALESCE(pp.id_number, cm.id_number))
    ) < 19
  GROUP BY cm.club_id;
END $$;

REVOKE ALL ON FUNCTION public.junior_move_org(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.junior_remove_org(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.junior_create_club(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.federation_create_workspace(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.org_junior_counts_for(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.junior_move_org(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.junior_remove_org(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.junior_create_club(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.federation_create_workspace(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.org_junior_counts_for(uuid) TO authenticated, service_role;