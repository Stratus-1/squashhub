-- Junior link: automatic confirmation, full member details, and a no-login parent consent link.

ALTER TABLE public.junior_reg_requests
  ADD COLUMN IF NOT EXISTS filled_by text,
  ADD COLUMN IF NOT EXISTS consent_status text NOT NULL DEFAULT 'not_needed',
  ADD COLUMN IF NOT EXISTS consent_token_hash text,
  ADD COLUMN IF NOT EXISTS consent_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS consent_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS consent_decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS consent_signed_name text;
UPDATE public.junior_reg_requests SET consent_status = 'given' WHERE consent_at IS NOT NULL AND consent_status = 'not_needed';
ALTER TABLE public.junior_reg_requests
  ADD CONSTRAINT junior_reg_requests_filled_by_chk CHECK (filled_by IS NULL OR filled_by IN ('parent', 'player')),
  ADD CONSTRAINT junior_reg_requests_consent_status_chk CHECK (consent_status IN ('not_needed', 'given', 'awaiting', 'declined'));
CREATE UNIQUE INDEX IF NOT EXISTS junior_reg_requests_consent_token ON public.junior_reg_requests(consent_token_hash) WHERE consent_token_hash IS NOT NULL;

-- Under 18: parent name + cell always. A parent filling in the form consents there; a player filling it in
-- gives the parent's email so the parent can consent through a private link. Returns true for players under 18.
CREATE OR REPLACE FUNCTION public._junior_check_guardian(p_dob date, p_parent_name text, p_parent_phone text, p_parent_email text,
  p_filled_by text, p_consent boolean) RETURNS boolean
LANGUAGE plpgsql STABLE SET search_path = public AS $$
BEGIN
  IF p_dob IS NULL OR p_dob > current_date OR p_dob < current_date - interval '100 years' THEN
    RAISE EXCEPTION 'Please enter a valid date of birth';
  END IF;
  IF age(current_date, p_dob) >= interval '18 years' THEN RETURN false; END IF;
  IF length(btrim(coalesce(p_parent_name, ''))) < 3 OR length(regexp_replace(coalesce(p_parent_phone, ''), '\D', '', 'g')) < 9 THEN
    RAISE EXCEPTION 'A parent or guardian''s name and cell number are needed for players under 18';
  END IF;
  IF coalesce(p_filled_by, '') NOT IN ('parent', 'player') THEN RAISE EXCEPTION 'Please say who is filling in the form'; END IF;
  IF p_filled_by = 'parent' AND NOT coalesce(p_consent, false) THEN
    RAISE EXCEPTION 'A parent or guardian must give consent for players under 18';
  END IF;
  IF p_filled_by = 'player' AND coalesce(btrim(p_parent_email), '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Please enter your parent or guardian''s email so they can give consent';
  END IF;
  RETURN true;
END $$;

-- Optional SA ID: 13 digits that match the birth date and are not already used at the club. Returns digits or NULL.
CREATE OR REPLACE FUNCTION public._junior_check_id(p_id text, p_dob date, p_club uuid, p_except uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v text := regexp_replace(coalesce(p_id, ''), '\D', '', 'g');
BEGIN
  IF v = '' THEN RETURN NULL; END IF;
  IF length(v) <> 13 THEN RAISE EXCEPTION 'An SA ID number has 13 digits'; END IF;
  IF p_dob IS NOT NULL AND left(v, 6) <> to_char(p_dob, 'YYMMDD') THEN
    RAISE EXCEPTION 'The ID number does not match the date of birth';
  END IF;
  IF EXISTS (SELECT 1 FROM public.club_members m WHERE m.club_id = p_club AND m.id IS DISTINCT FROM p_except
               AND coalesce(m.status::text, 'active') <> 'resigned' AND regexp_replace(coalesce(m.id_number, ''), '\D', '', 'g') = v) THEN
    RAISE EXCEPTION 'This ID number is already registered at the club. Search for the player''s name instead.';
  END IF;
  RETURN v;
END $$;

-- Leaders and the club's admins hear about the outcome. Automatic confirmations are for information only.
CREATE OR REPLACE FUNCTION public._junior_notify_request(p_req uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_org_name text; v_club text; v_tenant uuid; v_msg text; v_auto boolean;
BEGIN
  SELECT * INTO r FROM public.junior_reg_requests WHERE id = p_req;
  SELECT name, club_id INTO v_org_name, v_tenant FROM public.organisations WHERE id = r.org_id;
  SELECT name INTO v_club FROM public.clubs WHERE id = r.club_id;
  v_auto := r.status IN ('approved', 'linked') AND r.decided_by IS NULL;
  v_msg := CASE r.kind
    WHEN 'missing_club' THEN coalesce(r.contact_name, 'Someone') || ' asked to add ' || coalesce(r.missing_club_name, 'a club')
                             || coalesce(' (' || nullif(r.missing_club_town, '') || ')', '') || ' to the club list.'
    WHEN 'claim' THEN coalesce(r.junior_name, 'A junior') || CASE WHEN v_auto THEN ' linked their profile at ' ELSE ' asked to claim their profile at ' END
                      || coalesce(v_club, 'a club') || '.'
    ELSE coalesce(r.junior_name, 'A junior') || ' registered at ' || coalesce(v_club, 'a club') || ' through the junior link'
         || CASE WHEN v_auto THEN ' and was confirmed automatically.' ELSE '.' END END;
  INSERT INTO public.notifications (user_id, type, title, message, url, data)
  SELECT u.user_id, 'junior_registration', 'Junior registration: ' || v_org_name,
         v_msg || CASE WHEN v_auto THEN '' ELSE ' Please review it.' END,
         '/?tab=junior-registrations', jsonb_build_object('request_id', r.id, 'club_id', v_tenant, 'org_id', r.org_id)
    FROM public._junior_body_leader_users(r.org_id) u;
  IF r.kind <> 'missing_club' AND r.club_id IS NOT NULL AND (r.kind <> 'claim' OR NOT v_auto) THEN
    INSERT INTO public.notifications (user_id, type, title, message, url, data)
    SELECT DISTINCT cm.user_id, 'membership_application',
           CASE WHEN v_auto THEN 'New junior member' ELSE 'Junior registration to confirm' END,
           v_msg || CASE WHEN v_auto THEN ' If this is wrong, remove them under Members.' ELSE ' Please confirm or remove them.' END,
           '/club-admin?tab=members', jsonb_build_object('club_member_id', r.club_member_id, 'club_id', r.club_id, 'request_id', r.id)
      FROM public.club_members cm
     WHERE cm.club_id = r.club_id AND cm.user_id IS NOT NULL AND coalesce(cm.status::text, 'active') = 'active'
       AND (cm.role = 'admin' OR public.has_club_permission(cm.user_id, r.club_id, 'members.approve'))
       AND cm.user_id NOT IN (SELECT user_id FROM public._junior_body_leader_users(r.org_id));
  END IF;
END $$;

-- Confirms a new / unlisted junior without a manual review (system write; the link checks are the authority).
CREATE OR REPLACE FUNCTION public._junior_auto_confirm(p_req uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_person uuid;
  v_claims text := current_setting('request.jwt.claims', true); v_sub text := current_setting('request.jwt.claim.sub', true);
BEGIN
  SELECT * INTO r FROM public.junior_reg_requests WHERE id = p_req FOR UPDATE;
  IF r.status <> 'pending' OR r.kind NOT IN ('new', 'existing_unlisted') THEN RETURN; END IF;
  PERFORM set_config('request.jwt.claims', '', true); PERFORM set_config('request.jwt.claim.sub', '', true);
  UPDATE public.club_members SET is_pending_approval = false, approved_at = coalesce(approved_at, now())
   WHERE id = r.club_member_id AND is_pending_approval AND coalesce(status::text, 'active') <> 'resigned'
   RETURNING person_id INTO v_person;
  PERFORM set_config('request.jwt.claims', coalesce(v_claims, ''), true); PERFORM set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
  IF v_person IS NOT NULL THEN PERFORM public._junior_mark_player(v_person, r.requester_user_id); END IF;
  UPDATE public.junior_reg_requests SET status = 'approved', decided_at = now(), decided_by = NULL WHERE id = r.id;
  INSERT INTO public.audit_events (org_id, club_id, actor_user_id, entity_type, entity_id, action)
  VALUES (r.org_id, r.club_id, r.requester_user_id, 'junior_reg_request', r.id, 'junior_registration_auto_confirmed');
END $$;

-- One-use private consent link (30 days) emailed to the parent from the SquashHub platform address.
CREATE OR REPLACE FUNCTION public._junior_send_consent(p_req uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_tok text := encode(extensions.gen_random_bytes(24), 'hex'); v_club text; v_org text;
BEGIN
  SELECT * INTO r FROM public.junior_reg_requests WHERE id = p_req;
  IF r.id IS NULL OR r.consent_status <> 'awaiting' OR coalesce(r.parent_email, '') = '' OR r.club_id IS NULL THEN RETURN; END IF;
  SELECT name INTO v_club FROM public.clubs WHERE id = r.club_id;
  SELECT name INTO v_org FROM public.organisations WHERE id = r.org_id;
  UPDATE public.junior_reg_requests SET consent_token_hash = encode(extensions.digest(v_tok, 'sha256'), 'hex'),
         consent_sent_at = now(), consent_expires_at = now() + interval '30 days'
   WHERE id = r.id;
  INSERT INTO public.email_outbox (club_id, club_member_id, recipient_email, recipient_name, subject, body, url, cta_label, kind, ref_id, status, scheduled_for)
  VALUES (r.club_id, NULL, r.parent_email, r.parent_name, 'Consent needed: ' || coalesce(r.junior_name, 'junior squash registration'),
    coalesce(r.junior_name, 'Your child') || ' registered as a junior squash player at ' || coalesce(v_club, 'their club')
      || ' through ' || coalesce(v_org, 'the junior association') || ' and gave your name as parent or guardian. '
      || 'Please open the link to give or decline consent. No login is needed. The link works once and is valid for 30 days.',
    'https://squashhub.co.za/junior-consent/' || v_tok, 'Give or decline consent', 'platform_notice', r.id, 'queued', now());
END $$;

REVOKE ALL ON FUNCTION public._junior_check_guardian(date, text, text, text, text, boolean), public._junior_check_id(text, date, uuid, uuid),
  public._junior_notify_request(uuid), public._junior_auto_confirm(uuid), public._junior_send_consent(uuid) FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.junior_join_register(text, uuid, text, text, text, date, text, text, text, text, text, boolean, text);
DROP FUNCTION IF EXISTS public.junior_join_claim(text, uuid, text, date, text, text, text, boolean);

CREATE OR REPLACE FUNCTION public.junior_join_register(p_token text, p_club_id uuid, p_kind text, p_name text, p_gender text,
  p_dob date, p_phone text, p_email text, p_parent_name text, p_parent_phone text, p_parent_email text, p_consent boolean,
  p_nsa_number text, p_id_number text, p_address text, p_skill_level text, p_filled_by text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_org uuid := public._junior_link_org(p_token); v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g');
        v_gender text := lower(btrim(coalesce(p_gender, ''))); v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
        v_pemail text := nullif(lower(btrim(coalesce(p_parent_email, ''))), ''); v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
        v_pphone text := nullif(btrim(coalesce(p_parent_phone, '')), ''); v_address text := nullif(btrim(coalesce(p_address, '')), '');
        v_skill text := nullif(lower(btrim(coalesce(p_skill_level, ''))), ''); v_id text; v_minor boolean; v_filled text;
        v_person uuid; v_member uuid; v_link uuid; v_req uuid; v_consent text;
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
  v_minor := public._junior_check_guardian(p_dob, p_parent_name, v_pphone, v_pemail, p_filled_by, p_consent);
  v_filled := CASE WHEN v_minor THEN p_filled_by ELSE coalesce(nullif(p_filled_by, ''), 'player') END;
  IF v_filled NOT IN ('parent', 'player') THEN v_filled := 'player'; END IF;
  IF length(regexp_replace(coalesce(v_phone, v_pphone, ''), '\D', '', 'g')) < 9 THEN RAISE EXCEPTION 'Please enter a cell number'; END IF;
  IF length(coalesce(v_address, '')) < 5 THEN RAISE EXCEPTION 'Please enter the player''s home address'; END IF;
  IF v_skill IS NOT NULL AND v_skill NOT IN ('advanced', 'intermediate', 'beginner') THEN RAISE EXCEPTION 'Please choose a skill level'; END IF;
  IF EXISTS (SELECT 1 FROM public.club_members m WHERE m.club_id = p_club_id AND coalesce(m.status::text, 'active') <> 'resigned'
               AND lower(regexp_replace(coalesce(m.name, ''), '[^a-zA-Z]', '', 'g')) = lower(regexp_replace(v_name, '[^a-zA-Z]', '', 'g'))) THEN
    RAISE EXCEPTION 'A player with this name is already on the club''s list. Search for the name and choose "This is the player".';
  END IF;
  v_id := public._junior_check_id(p_id_number, p_dob, p_club_id, NULL);
  SELECT id INTO v_link FROM public.junior_reg_links WHERE token = btrim(p_token);

  INSERT INTO public.people (full_name, first_name, last_name, gender, email, phone)
  VALUES (v_name, split_part(v_name, ' ', 1), btrim(substr(v_name, length(split_part(v_name, ' ', 1)) + 1)), v_gender, v_email, v_phone)
  RETURNING id INTO v_person;
  UPDATE public.people SET national_player_number = 'SSA' || lpad((
    coalesce((SELECT max(nullif(regexp_replace(national_player_number, '\D', '', 'g'), '')::bigint) FROM public.people), 0) + 1)::text, 6, '0')
  WHERE id = v_person;
  PERFORM public._junior_save_dob(v_person, p_dob);

  -- System write (see 0493): linked to the registering login, off the ladder, billing-exempt.
  PERFORM set_config('app.tournament_join', '1', true);
  PERFORM set_config('request.jwt.claims', '', true); PERFORM set_config('request.jwt.claim.sub', '', true);
  INSERT INTO public.club_members (club_id, user_id, person_id, name, gender, phone, email, id_number, address, skill_level, role, status,
    is_pending_approval, billing_exempt, plays_league, applied_at, join_source, join_kind)
  VALUES (p_club_id, v_uid, v_person, v_name, v_gender, coalesce(v_phone, v_pphone), coalesce(v_email, v_pemail), v_id, v_address, v_skill,
    'member', 'active', true, true, false, now(), 'junior_link', p_kind)
  RETURNING id INTO v_member;
  PERFORM set_config('request.jwt.claims', coalesce(v_claims, ''), true); PERFORM set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
  PERFORM set_config('app.tournament_join', '', true);

  v_consent := CASE WHEN NOT v_minor THEN 'not_needed' WHEN v_filled = 'parent' THEN 'given' ELSE 'awaiting' END;
  INSERT INTO public.junior_reg_requests (org_id, link_id, kind, club_id, club_member_id, requester_user_id, junior_name, gender,
    parent_name, parent_phone, parent_email, consent_at, nsa_number, filled_by, consent_status, consent_signed_name, consent_decided_at)
  VALUES (v_org, v_link, p_kind, p_club_id, v_member, v_uid, v_name, v_gender, nullif(btrim(p_parent_name), ''), v_pphone, v_pemail,
    CASE WHEN v_consent = 'given' THEN now() END, nullif(upper(btrim(coalesce(p_nsa_number, ''))), ''), v_filled, v_consent,
    CASE WHEN v_consent = 'given' THEN btrim(p_parent_name) END, CASE WHEN v_consent = 'given' THEN now() END)
  RETURNING id INTO v_req;
  INSERT INTO public.audit_events (org_id, club_id, actor_user_id, entity_type, entity_id, action, after_data)
  VALUES (v_org, p_club_id, v_uid, 'club_member', v_member, 'junior_link_registered',
          jsonb_build_object('kind', p_kind, 'request_id', v_req, 'filled_by', v_filled, 'consent', v_consent));

  IF v_consent = 'awaiting' THEN
    PERFORM public._junior_send_consent(v_req);
    RETURN jsonb_build_object('status', 'awaiting_consent', 'member_id', v_member);
  END IF;
  PERFORM public._junior_auto_confirm(v_req);
  PERFORM public._junior_notify_request(v_req);
  RETURN jsonb_build_object('status', 'registered', 'member_id', v_member);
END $$;

-- Claims link at once when the login, NSA number or a saved birth date matches; otherwise a leader or the club confirms.
CREATE OR REPLACE FUNCTION public.junior_join_claim(p_token text, p_member_id uuid, p_nsa_number text, p_dob date,
  p_parent_name text, p_parent_phone text, p_parent_email text, p_consent boolean, p_filled_by text, p_id_number text, p_address text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); v_org uuid := public._junior_link_org(p_token); m record; v_nsa text := upper(btrim(coalesce(p_nsa_number, '')));
        v_link uuid; v_req uuid; v_minor boolean; v_filled text; v_consent text; v_id text; v_saved_dob date;
        v_pemail text := nullif(lower(btrim(coalesce(p_parent_email, ''))), ''); v_address text := nullif(btrim(coalesce(p_address, '')), '');
        v_claims text := current_setting('request.jwt.claims', true); v_sub text := current_setting('request.jwt.claim.sub', true);
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Please sign in first'; END IF;
  IF v_org IS NULL THEN RAISE EXCEPTION 'This registration link is not active'; END IF;
  SELECT * INTO m FROM public.club_members WHERE id = p_member_id;
  IF m.id IS NULL OR m.role = 'visitor' OR coalesce(m.status::text, 'active') <> 'active'
     OR NOT EXISTS (SELECT 1 FROM public._junior_body_clubs(v_org) b WHERE b.club_id = m.club_id) THEN
    RAISE EXCEPTION 'That profile cannot be claimed here';
  END IF;
  v_minor := public._junior_check_guardian(p_dob, p_parent_name, p_parent_phone, v_pemail, p_filled_by, p_consent);
  v_filled := CASE WHEN v_minor THEN p_filled_by ELSE coalesce(nullif(p_filled_by, ''), 'player') END;
  IF v_filled NOT IN ('parent', 'player') THEN v_filled := 'player'; END IF;
  v_consent := CASE WHEN NOT v_minor THEN 'not_needed' WHEN v_filled = 'parent' THEN 'given' ELSE 'awaiting' END;
  v_id := CASE WHEN coalesce(btrim(m.id_number), '') = '' THEN public._junior_check_id(p_id_number, p_dob, m.club_id, m.id) END;
  SELECT id INTO v_link FROM public.junior_reg_links WHERE token = btrim(p_token);
  SELECT date_of_birth INTO v_saved_dob FROM public.people_private WHERE person_id = m.person_id;

  IF m.user_id IS NOT NULL AND m.user_id <> v_uid THEN
    RAISE EXCEPTION 'This profile is already linked to another login. Please sign in with that login, or ask the club.';
  END IF;

  IF m.user_id = v_uid
     OR (v_nsa <> '' AND EXISTS (SELECT 1 FROM public.member_association_affiliations a
           WHERE a.club_member_id = m.id AND a.active AND upper(btrim(a.league_association_number)) = v_nsa))
     OR (v_saved_dob IS NOT NULL AND v_saved_dob = p_dob) THEN
    IF m.user_id IS NULL THEN
      PERFORM set_config('app.tournament_join_link', v_uid::text, true);
      UPDATE public.club_members SET user_id = v_uid WHERE id = m.id AND user_id IS NULL;
      PERFORM set_config('app.tournament_join_link', '', true);
      IF NOT EXISTS (SELECT 1 FROM public.club_members WHERE id = m.id AND user_id = v_uid) THEN
        RAISE EXCEPTION 'The profile could not be linked. Please try again.';
      END IF;
    END IF;
    -- Fill only details the club does not have yet.
    IF v_id IS NOT NULL OR (v_address IS NOT NULL AND coalesce(btrim(m.address), '') = '') THEN
      PERFORM set_config('request.jwt.claims', '', true); PERFORM set_config('request.jwt.claim.sub', '', true);
      UPDATE public.club_members SET id_number = coalesce(nullif(btrim(id_number), ''), v_id),
             address = coalesce(nullif(btrim(address), ''), v_address)
       WHERE id = m.id;
      PERFORM set_config('request.jwt.claims', coalesce(v_claims, ''), true); PERFORM set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
    END IF;
    PERFORM public._junior_save_dob(m.person_id, p_dob);
    IF m.person_id IS NOT NULL THEN PERFORM public._junior_mark_player(m.person_id, v_uid); END IF;
    INSERT INTO public.junior_reg_requests (org_id, link_id, kind, club_id, club_member_id, requester_user_id, junior_name,
      parent_name, parent_phone, parent_email, consent_at, nsa_number, status, decided_at, filled_by, consent_status, consent_signed_name, consent_decided_at)
    VALUES (v_org, v_link, 'claim', m.club_id, m.id, v_uid, m.name, nullif(btrim(p_parent_name), ''), nullif(btrim(p_parent_phone), ''),
      v_pemail, CASE WHEN v_consent = 'given' THEN now() END, nullif(v_nsa, ''), 'linked', now(), v_filled, v_consent,
      CASE WHEN v_consent = 'given' THEN btrim(p_parent_name) END, CASE WHEN v_consent = 'given' THEN now() END)
    RETURNING id INTO v_req;
    INSERT INTO public.audit_events (org_id, club_id, actor_user_id, entity_type, entity_id, action)
    VALUES (v_org, m.club_id, v_uid, 'club_member', m.id, 'junior_link_profile_linked');
    IF v_consent = 'awaiting' THEN PERFORM public._junior_send_consent(v_req); END IF;
    PERFORM public._junior_notify_request(v_req);
    RETURN jsonb_build_object('status', CASE WHEN v_consent = 'awaiting' THEN 'linked_awaiting_consent' ELSE 'linked' END, 'member_id', m.id);
  END IF;

  SELECT id INTO v_req FROM public.junior_reg_requests WHERE club_member_id = m.id AND kind = 'claim' AND status = 'pending';
  IF v_req IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.junior_reg_requests WHERE id = v_req AND requester_user_id = v_uid) THEN
      RETURN jsonb_build_object('status', 'pending_claim', 'member_id', m.id);
    END IF;
    RAISE EXCEPTION 'Someone has already asked to claim this profile. The association or club will check it.';
  END IF;
  INSERT INTO public.junior_reg_requests (org_id, link_id, kind, club_id, club_member_id, requester_user_id, junior_name,
    date_of_birth, parent_name, parent_phone, parent_email, consent_at, nsa_number, filled_by, consent_status, consent_signed_name, consent_decided_at)
  VALUES (v_org, v_link, 'claim', m.club_id, m.id, v_uid, m.name, p_dob, nullif(btrim(p_parent_name), ''),
    nullif(btrim(p_parent_phone), ''), v_pemail, CASE WHEN v_consent = 'given' THEN now() END, nullif(v_nsa, ''), v_filled, v_consent,
    CASE WHEN v_consent = 'given' THEN btrim(p_parent_name) END, CASE WHEN v_consent = 'given' THEN now() END)
  RETURNING id INTO v_req;
  IF v_consent = 'awaiting' THEN PERFORM public._junior_send_consent(v_req); END IF;
  PERFORM public._junior_notify_request(v_req);
  RETURN jsonb_build_object('status', 'pending_claim', 'member_id', m.id);
END $$;

-- ---------- public consent link ----------
CREATE OR REPLACE FUNCTION public.junior_consent_view(p_token text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF coalesce(p_token, '') !~ '^[0-9a-f]{48}$' THEN RETURN jsonb_build_object('found', false); END IF;
  SELECT q.*, c.name AS club_name, o.name AS org_name INTO r
    FROM public.junior_reg_requests q LEFT JOIN public.clubs c ON c.id = q.club_id LEFT JOIN public.organisations o ON o.id = q.org_id
   WHERE q.consent_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  IF r.id IS NULL THEN RETURN jsonb_build_object('found', false); END IF;
  RETURN jsonb_build_object('found', true, 'junior_name', r.junior_name, 'club_name', r.club_name, 'org_name', r.org_name,
    'parent_name', r.parent_name, 'consent_status', r.consent_status, 'expired', r.consent_expires_at < now(),
    'registration_declined', r.status = 'declined');
END $$;

CREATE OR REPLACE FUNCTION public.junior_consent_decide(p_token text, p_approve boolean, p_name text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_name text := regexp_replace(btrim(coalesce(p_name, '')), '\s+', ' ', 'g'); v_title text; v_msg text;
  v_claims text := current_setting('request.jwt.claims', true); v_sub text := current_setting('request.jwt.claim.sub', true);
BEGIN
  IF coalesce(p_token, '') !~ '^[0-9a-f]{48}$' THEN RAISE EXCEPTION 'This link is not valid'; END IF;
  SELECT * INTO r FROM public.junior_reg_requests
   WHERE consent_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex') FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'This link is not valid'; END IF;
  IF r.consent_status <> 'awaiting' THEN RAISE EXCEPTION 'This consent request has already been answered'; END IF;
  IF r.consent_expires_at < now() THEN RAISE EXCEPTION 'This link has expired. Please ask the junior association to send a new one.'; END IF;
  IF r.status = 'declined' THEN RAISE EXCEPTION 'This registration was already removed'; END IF;
  IF length(v_name) < 3 OR position(' ' IN v_name) = 0 THEN RAISE EXCEPTION 'Please type your first name and surname'; END IF;

  UPDATE public.junior_reg_requests
     SET consent_status = CASE WHEN p_approve THEN 'given' ELSE 'declined' END, consent_decided_at = now(),
         consent_at = CASE WHEN p_approve THEN now() ELSE consent_at END, consent_signed_name = left(v_name, 120),
         consent_token_hash = NULL
   WHERE id = r.id;
  INSERT INTO public.audit_events (org_id, club_id, actor_user_id, entity_type, entity_id, action, after_data)
  VALUES (r.org_id, r.club_id, NULL, 'junior_reg_request', r.id,
          CASE WHEN p_approve THEN 'junior_parent_consent_given' ELSE 'junior_parent_consent_declined' END,
          jsonb_build_object('signed_name', left(v_name, 120), 'via', 'email_link'));

  IF p_approve THEN
    IF r.kind IN ('new', 'existing_unlisted') AND r.status = 'pending' THEN
      PERFORM public._junior_auto_confirm(r.id);
      PERFORM public._junior_notify_request(r.id);
    END IF;
    v_title := 'Parent consent received';
    v_msg := coalesce(r.junior_name, 'The player') || CASE WHEN r.kind = 'claim' AND r.status = 'pending'
      THEN '''s parent gave consent. The club or association still confirms the profile.' ELSE ' is now confirmed. A parent gave consent.' END;
  ELSE
    IF r.kind IN ('new', 'existing_unlisted') AND r.status = 'pending' THEN
      PERFORM set_config('request.jwt.claims', '', true); PERFORM set_config('request.jwt.claim.sub', '', true);
      UPDATE public.club_members SET status = 'resigned', is_pending_approval = false WHERE id = r.club_member_id AND is_pending_approval;
      PERFORM set_config('request.jwt.claims', coalesce(v_claims, ''), true); PERFORM set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
      UPDATE public.junior_reg_requests SET status = 'declined', decided_at = now(), decline_reason = 'The parent or guardian did not give consent'
       WHERE id = r.id;
    END IF;
    INSERT INTO public.notifications (user_id, type, title, message, url, data)
    SELECT u.user_id, 'junior_registration', 'Parent declined consent', coalesce(r.junior_name, 'A junior') || '''s parent or guardian did not give consent.'
           || CASE WHEN r.kind = 'claim' THEN ' The profile link stays; please follow up with the family.' ELSE ' The registration was removed.' END,
           '/?tab=junior-registrations', jsonb_build_object('request_id', r.id, 'org_id', r.org_id)
      FROM public._junior_body_leader_users(r.org_id) u;
    v_title := 'Parent did not give consent';
    v_msg := coalesce(r.junior_name, 'The player') || '''s parent or guardian did not give consent.';
  END IF;
  IF r.requester_user_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, url, data)
    VALUES (r.requester_user_id, 'junior_registration', v_title, v_msg, '/', jsonb_build_object('request_id', r.id, 'club_id', r.club_id));
  END IF;
  RETURN jsonb_build_object('status', CASE WHEN p_approve THEN 'given' ELSE 'declined' END);
END $$;

CREATE OR REPLACE FUNCTION public.junior_consent_resend(p_request_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); r record;
BEGIN
  IF v_uid IS NULL OR NOT public._junior_can_review(v_uid, p_request_id) THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM public.junior_reg_requests WHERE id = p_request_id FOR UPDATE;
  IF r.consent_status <> 'awaiting' OR r.status = 'declined' THEN RAISE EXCEPTION 'This registration is not waiting for consent'; END IF;
  IF coalesce(r.parent_email, '') = '' THEN RAISE EXCEPTION 'No parent email is saved'; END IF;
  IF r.consent_sent_at > now() - interval '1 hour' THEN RAISE EXCEPTION 'The consent email was sent less than an hour ago'; END IF;
  PERFORM public._junior_send_consent(r.id);
  INSERT INTO public.audit_events (org_id, club_id, actor_user_id, entity_type, entity_id, action)
  VALUES (r.org_id, r.club_id, v_uid, 'junior_reg_request', r.id, 'junior_parent_consent_resent');
  RETURN jsonb_build_object('status', 'sent');
END $$;

-- ---------- review (consent fields; no approval while a parent's consent is outstanding) ----------
CREATE OR REPLACE FUNCTION public.junior_reg_list(p_org uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF NOT public._junior_can_lead(v_uid, p_org) THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  RETURN (SELECT coalesce(jsonb_agg(x ORDER BY (x->>'status') = 'pending' DESC, x->>'created_at' DESC), '[]'::jsonb) FROM (
    SELECT jsonb_build_object(
      'id', r.id, 'kind', r.kind, 'club_id', r.club_id, 'club_name', c.name, 'junior_name', r.junior_name, 'gender', r.gender,
      'age_group', public._junior_age_group(coalesce(r.date_of_birth, pp.date_of_birth)),
      'parent_name', r.parent_name, 'parent_phone', r.parent_phone, 'parent_email', r.parent_email, 'consent', r.consent_at IS NOT NULL,
      'consent_status', r.consent_status, 'filled_by', r.filled_by, 'consent_signed_name', r.consent_signed_name,
      'consent_decided_at', r.consent_decided_at, 'consent_sent_at', r.consent_sent_at,
      'auto', r.decided_by IS NULL AND r.status IN ('approved', 'linked') AND r.kind <> 'missing_club',
      'nsa_number', r.nsa_number, 'missing_club_name', r.missing_club_name, 'missing_club_town', r.missing_club_town,
      'contact_name', r.contact_name, 'contact_phone', r.contact_phone, 'contact_email', r.contact_email,
      'status', CASE
        WHEN r.status = 'pending' AND r.kind IN ('new','existing_unlisted') AND m.id IS NOT NULL AND m.status::text = 'resigned' THEN 'declined'
        WHEN r.status = 'pending' AND r.kind IN ('new','existing_unlisted') AND m.id IS NOT NULL AND NOT coalesce(m.is_pending_approval, false) THEN 'approved'
        ELSE r.status END,
      'decided_by', dp.name, 'decided_at', r.decided_at, 'decline_reason', r.decline_reason,
      'via', lo.name, 'created_at', r.created_at) AS x
    FROM public.junior_reg_requests r
    LEFT JOIN public.clubs c ON c.id = r.club_id
    LEFT JOIN public.club_members m ON m.id = r.club_member_id
    LEFT JOIN public.people_private pp ON pp.person_id = m.person_id
    LEFT JOIN public.profiles dp ON dp.id = r.decided_by
    LEFT JOIN public.organisations lo ON lo.id = r.org_id
    WHERE r.org_id = p_org
       OR r.club_id IN (SELECT club_id FROM public._junior_body_clubs(p_org))
       OR r.org_id IN (SELECT d.org_id FROM public.org_grouping_descendants(p_org) d)) s);
END $$;

CREATE OR REPLACE FUNCTION public.junior_reg_decide(p_request_id uuid, p_approve boolean, p_reason text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := auth.uid(); r record; m record;
  v_claims text := current_setting('request.jwt.claims', true); v_sub text := current_setting('request.jwt.claim.sub', true);
BEGIN
  IF v_uid IS NULL OR NOT public._junior_can_review(v_uid, p_request_id) THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM public.junior_reg_requests WHERE id = p_request_id FOR UPDATE;
  IF r.status <> 'pending' THEN RAISE EXCEPTION 'This request has already been decided'; END IF;
  IF p_approve AND r.kind IN ('new', 'existing_unlisted') AND r.consent_status = 'awaiting' THEN
    RAISE EXCEPTION 'Still waiting for the parent or guardian''s consent';
  END IF;
  IF NOT p_approve AND length(btrim(coalesce(p_reason, ''))) < 3 THEN RAISE EXCEPTION 'Please give a short reason'; END IF;
  SELECT * INTO m FROM public.club_members WHERE id = r.club_member_id;

  IF r.club_id IS NOT NULL AND NOT public.is_club_admin(v_uid, r.club_id) THEN
    PERFORM set_config('request.jwt.claims', '', true); PERFORM set_config('request.jwt.claim.sub', '', true);
  END IF;
  IF r.kind IN ('new', 'existing_unlisted') AND m.id IS NOT NULL THEN
    IF p_approve THEN
      IF m.status::text = 'resigned' THEN RAISE EXCEPTION 'This player was already removed by the club'; END IF;
      UPDATE public.club_members SET is_pending_approval = false, approved_at = coalesce(approved_at, now()), approved_by = coalesce(approved_by, v_uid)
       WHERE id = m.id AND is_pending_approval;
      IF m.person_id IS NOT NULL THEN PERFORM public._junior_mark_player(m.person_id, v_uid); END IF;
    ELSIF coalesce(m.is_pending_approval, false) THEN
      UPDATE public.club_members SET status = 'resigned', is_pending_approval = false WHERE id = m.id;
    END IF;
  ELSIF r.kind = 'claim' AND m.id IS NOT NULL AND p_approve THEN
    IF m.user_id IS NOT NULL AND m.user_id <> r.requester_user_id THEN RAISE EXCEPTION 'This profile is already linked to another login'; END IF;
    PERFORM set_config('app.tournament_join_link', r.requester_user_id::text, true);
    UPDATE public.club_members SET user_id = r.requester_user_id WHERE id = m.id AND user_id IS NULL;
    PERFORM set_config('app.tournament_join_link', '', true);
    PERFORM public._junior_save_dob(m.person_id, r.date_of_birth);
    IF m.person_id IS NOT NULL THEN PERFORM public._junior_mark_player(m.person_id, v_uid); END IF;
  END IF;
  PERFORM set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  PERFORM set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);

  UPDATE public.junior_reg_requests
     SET status = CASE WHEN p_approve THEN 'approved' ELSE 'declined' END, decided_by = v_uid, decided_at = now(),
         decline_reason = CASE WHEN p_approve THEN NULL ELSE left(btrim(p_reason), 500) END,
         date_of_birth = NULL,
         consent_token_hash = CASE WHEN p_approve THEN consent_token_hash ELSE NULL END
   WHERE id = r.id;
  IF r.requester_user_id IS NOT NULL AND r.kind <> 'missing_club' THEN
    INSERT INTO public.notifications (user_id, type, title, message, url, data)
    VALUES (r.requester_user_id, 'junior_registration',
      CASE WHEN p_approve THEN 'Junior registration approved' ELSE 'Junior registration declined' END,
      coalesce(r.junior_name, 'The player') || CASE WHEN p_approve THEN ' is now confirmed.' ELSE ' was not confirmed: ' || btrim(p_reason) END,
      '/', jsonb_build_object('request_id', r.id, 'club_id', r.club_id));
  END IF;
  INSERT INTO public.audit_events (org_id, club_id, actor_user_id, entity_type, entity_id, action, reason)
  VALUES (r.org_id, r.club_id, v_uid, 'junior_reg_request', r.id,
          CASE WHEN p_approve THEN 'junior_registration_approved' ELSE 'junior_registration_declined' END, nullif(btrim(coalesce(p_reason, '')), ''));
  RETURN jsonb_build_object('status', CASE WHEN p_approve THEN 'approved' ELSE 'declined' END);
END $$;

REVOKE ALL ON FUNCTION public.junior_join_register(text, uuid, text, text, text, date, text, text, text, text, text, boolean, text, text, text, text, text),
  public.junior_join_claim(text, uuid, text, date, text, text, text, boolean, text, text, text),
  public.junior_consent_resend(uuid), public.junior_reg_list(uuid), public.junior_reg_decide(uuid, boolean, text),
  public.junior_consent_view(text), public.junior_consent_decide(text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.junior_join_register(text, uuid, text, text, text, date, text, text, text, text, text, boolean, text, text, text, text, text),
  public.junior_join_claim(text, uuid, text, date, text, text, text, boolean, text, text, text),
  public.junior_consent_resend(uuid), public.junior_reg_list(uuid), public.junior_reg_decide(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.junior_consent_view(text), public.junior_consent_decide(text, boolean, text) TO anon, authenticated;