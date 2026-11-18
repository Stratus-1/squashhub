CREATE OR REPLACE FUNCTION public.federation_move_club(_club_id uuid, _new_parent_org uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  v_club public.clubs%ROWTYPE;
  v_club_org uuid;
  v_old record;
  v_old_ids uuid[] := '{}';
  v_new_name text;
  v_actor text;
  v_tenant uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Please sign in again.'; END IF;
  SELECT * INTO v_club FROM public.clubs WHERE id = _club_id;
  IF NOT FOUND OR v_club.tenant_type = 'association' THEN RAISE EXCEPTION 'Club not found.'; END IF;

  IF _new_parent_org IS NOT NULL THEN
    IF NOT public.federation_is_senior_parent(_new_parent_org) THEN
      RAISE EXCEPTION 'Clubs can only be moved into an association.';
    END IF;
    SELECT name INTO v_new_name FROM public.organisations WHERE id = _new_parent_org;
  END IF;

  SELECT id INTO v_club_org FROM public.organisations WHERE kind = 'club' AND club_id = _club_id ORDER BY created_at LIMIT 1;
  IF v_club_org IS NULL THEN
    INSERT INTO public.organisations(kind, name, club_id, active) VALUES ('club', v_club.name, _club_id, true)
    RETURNING id INTO v_club_org;
  END IF;

  SELECT array_agg(DISTINCT r.parent_org_id) INTO v_old_ids
  FROM public.organisation_relationships r
  WHERE r.child_org_id = v_club_org AND public.federation_is_senior_parent(r.parent_org_id)
    AND (r.effective_to IS NULL OR r.effective_to >= CURRENT_DATE);
  v_old_ids := COALESCE(v_old_ids, '{}');

  IF _new_parent_org IS NOT NULL AND v_old_ids = ARRAY[_new_parent_org] THEN
    RETURN jsonb_build_object('ok', true, 'unchanged', true);
  END IF;

  IF _new_parent_org IS NOT NULL THEN
    IF NOT public.federation_can_manage_org(uid, _new_parent_org) THEN
      RAISE EXCEPTION 'You can only move clubs into an association you manage.';
    END IF;
  ELSE
    IF NOT (public.is_platform_admin(uid) OR public.is_national_admin(uid)
      OR (cardinality(v_old_ids) > 0 AND (SELECT bool_and(public.federation_can_manage_org(uid, x)) FROM unnest(v_old_ids) x))) THEN
      RAISE EXCEPTION 'You can only remove clubs from an association you manage.';
    END IF;
  END IF;

  DELETE FROM public.organisation_relationships r
  WHERE r.child_org_id = v_club_org AND r.parent_org_id = ANY(v_old_ids);

  DELETE FROM public.association_affiliated_clubs a
  WHERE a.club_id = _club_id
    AND a.association_tenant_id IN (SELECT public.federation_org_tenant(x) FROM unnest(v_old_ids) x);

  IF _new_parent_org IS NOT NULL THEN
    INSERT INTO public.organisation_relationships(parent_org_id, child_org_id, relationship, effective_from)
    VALUES (_new_parent_org, v_club_org, 'affiliation', CURRENT_DATE)
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT COALESCE(NULLIF(trim(p.name),''), u.email, 'An administrator') INTO v_actor
  FROM auth.users u LEFT JOIN public.profiles p ON p.id = u.id WHERE u.id = uid;

  INSERT INTO public.audit_events(org_id, club_id, actor_user_id, actor_label, entity_type, entity_id, action, reason, before_data, after_data)
  VALUES (v_club_org, _club_id, uid, v_actor, 'club_association', v_club_org, 'move_club', 'federation_move_club',
    jsonb_build_object('parent_org_ids', to_jsonb(v_old_ids)), jsonb_build_object('parent_org_id', _new_parent_org));

  FOR v_old IN SELECT o.id, o.name FROM public.organisations o WHERE o.id = ANY(v_old_ids) AND o.id IS DISTINCT FROM _new_parent_org LOOP
    v_tenant := public.federation_org_tenant(v_old.id);
    WITH recips AS (
      SELECT DISTINCT a.user_id FROM public.organisation_admins a
      WHERE a.org_id = v_old.id AND a.active AND a.user_id <> uid
      UNION
      SELECT DISTINCT cm.user_id FROM public.club_members cm
      WHERE v_tenant IS NOT NULL AND cm.club_id = v_tenant AND cm.role = 'admin' AND cm.status = 'active'
        AND cm.user_id IS NOT NULL AND cm.user_id <> uid
    )
    INSERT INTO public.notifications(user_id, title, message, type, url, data)
    SELECT r.user_id, 'Club moved out of ' || v_old.name,
      v_club.name || ' was moved ' || COALESCE('to ' || v_new_name, 'out of ' || v_old.name) || ' by ' || v_actor || '.',
      'federation', '/', jsonb_build_object('club_id', _club_id, 'from_org', v_old.id, 'to_org', _new_parent_org)
    FROM recips r WHERE r.user_id IS NOT NULL;

    WITH emails AS (
      SELECT DISTINCT ON (lower(trim(e.email))) e.email, e.name, e.member_id FROM (
        SELECT u.email, COALESCE(p.name, u.email) AS name, NULL::uuid AS member_id
        FROM public.organisation_admins a JOIN auth.users u ON u.id = a.user_id
        LEFT JOIN public.profiles p ON p.id = u.id
        WHERE a.org_id = v_old.id AND a.active AND a.user_id <> uid
        UNION ALL
        SELECT cm.email, cm.name, cm.id FROM public.club_members cm
        WHERE v_tenant IS NOT NULL AND cm.club_id = v_tenant AND cm.role = 'admin' AND cm.status = 'active'
          AND (cm.user_id IS NULL OR cm.user_id <> uid)
      ) e WHERE trim(COALESCE(e.email,'')) LIKE '%@%'
    )
    INSERT INTO public.email_outbox(club_id, club_member_id, recipient_email, recipient_name, subject, body, kind, ref_id)
    SELECT COALESCE(v_tenant, _club_id), e.member_id, trim(e.email), e.name,
      v_club.name || ' moved out of ' || v_old.name,
      v_club.name || ' is no longer listed under ' || v_old.name || '. It was moved '
        || COALESCE('to ' || v_new_name, 'to "no association"') || ' by ' || v_actor
        || '. If this is wrong, please contact the person who moved it or SquashHub support.',
      'federation_club_moved', v_club_org
    FROM emails e;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'from', to_jsonb(v_old_ids), 'to', _new_parent_org);
END $$;