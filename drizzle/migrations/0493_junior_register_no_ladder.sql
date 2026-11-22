CREATE OR REPLACE FUNCTION public.junior_join_register(p_token text, p_club_id uuid, p_kind text, p_name text, p_gender text,
  p_dob date, p_phone text DEFAULT NULL, p_email text DEFAULT NULL, p_parent_name text DEFAULT NULL,
  p_parent_phone text DEFAULT NULL, p_parent_email text DEFAULT NULL, p_consent boolean DEFAULT false, p_nsa_number text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_org uuid := public._junior_link_org(p_token); v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
        v_gender text := lower(btrim(coalesce(p_gender, ''))); v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
        v_pemail text := nullif(lower(btrim(coalesce(p_parent_email, ''))), ''); v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
        v_pphone text := nullif(btrim(coalesce(p_parent_phone, '')), ''); v_person uuid; v_member uuid; v_link uuid; v_req uuid;
        v_claims text := current_setting('request.jwt.claims', true); v_sub text := current_setting('request.jwt.claim.sub', true);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Please sign in first'; END IF;
  IF v_org IS NULL THEN RAISE EXCEPTION 'This registration link is not active'; END IF;
  IF p_kind NOT IN ('new', 'existing_unlisted') THEN RAISE EXCEPTION 'Choose how you are joining'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public._junior_body_clubs(v_org) b WHERE b.club_id = p_club_id) THEN
    RAISE EXCEPTION 'That club is not part of this association';
  END IF;
  IF position(' ' IN v_name) = 0 OR length(v_name) < 4 THEN RAISE EXCEPTION 'Please enter the player''s first name and surname'; END IF;
  IF v_gender NOT IN ('male', 'female') THEN RAISE EXCEPTION 'Please choose boy or girl'; END IF;
  PERFORM public._junior_check_details(p_dob, p_parent_name, v_pphone, p_consent);
  IF EXISTS (SELECT 1 FROM public.club_members m WHERE m.club_id = p_club_id AND coalesce(m.status::text, 'active') <> 'resigned'
               AND lower(regexp_replace(coalesce(m.name, ''), '[^a-zA-Z]', '', 'g')) = lower(regexp_replace(v_name, '[^a-zA-Z]', '', 'g'))) THEN
    RAISE EXCEPTION 'A player with this name is already on the club''s list. Search for the name and choose "This is me".';
  END IF;
  SELECT id INTO v_link FROM public.junior_reg_links WHERE token = btrim(p_token);

  -- The junior is their own person, even when a parent's login registers them.
  INSERT INTO public.people (full_name, first_name, last_name, gender, email, phone)
  VALUES (v_name, split_part(v_name, ' ', 1), btrim(substr(v_name, length(split_part(v_name, ' ', 1)) + 1)), v_gender, v_email, v_phone)
  RETURNING id INTO v_person;
  UPDATE public.people SET national_player_number = 'SSA' || lpad((
    coalesce((SELECT max(nullif(regexp_replace(national_player_number, '\D', '', 'g'), '')::bigint) FROM public.people), 0) + 1)::text, 6, '0')
  WHERE id = v_person;
  PERFORM public._junior_save_dob(v_person, p_dob);

  -- Linked to the login that registered them (a parent's shared login, or the junior's own). Inserted as a
  -- system write: the checks above are the authority, a parent's own membership at this club must not count as
  -- a duplicate, and pending juniors stay off the ladder until the club places them.
  PERFORM set_config('app.tournament_join', '1', true);
  PERFORM set_config('request.jwt.claims', '', true); PERFORM set_config('request.jwt.claim.sub', '', true);
  INSERT INTO public.club_members (club_id, user_id, person_id, name, gender, phone, email, role, status, is_pending_approval,
    billing_exempt, plays_league, applied_at, join_source, join_kind)
  VALUES (p_club_id, v_uid, v_person, v_name, v_gender, coalesce(v_phone, v_pphone), coalesce(v_email, v_pemail),
    'member', 'active', true, true, false, now(), 'junior_link', p_kind)
  RETURNING id INTO v_member;
  PERFORM set_config('request.jwt.claims', coalesce(v_claims, ''), true); PERFORM set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
  PERFORM set_config('app.tournament_join', '', true);

  INSERT INTO public.junior_reg_requests (org_id, link_id, kind, club_id, club_member_id, requester_user_id, junior_name, gender,
    parent_name, parent_phone, parent_email, consent_at, nsa_number)
  VALUES (v_org, v_link, p_kind, p_club_id, v_member, v_uid, v_name, v_gender, nullif(btrim(p_parent_name), ''), v_pphone, v_pemail,
    CASE WHEN p_consent THEN now() END, nullif(upper(btrim(coalesce(p_nsa_number, ''))), ''))
  RETURNING id INTO v_req;
  INSERT INTO public.audit_events (org_id, club_id, actor_user_id, entity_type, entity_id, action, after_data)
  VALUES (v_org, p_club_id, v_uid, 'club_member', v_member, 'junior_link_registered', jsonb_build_object('kind', p_kind, 'request_id', v_req));
  PERFORM public._junior_notify_request(v_req);
  RETURN jsonb_build_object('status', 'registered', 'member_id', v_member);
END $$;