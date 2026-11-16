-- Regional open entry link + external partners (plan approved 16 Nov 2026)

ALTER TABLE public.club_members
  ADD COLUMN IF NOT EXISTS join_source text,
  ADD COLUMN IF NOT EXISTS join_kind text,
  ADD COLUMN IF NOT EXISTS joined_via_tournament_id uuid;
COMMENT ON COLUMN public.club_members.join_source IS 'tournament_link = created through a tournament open entry link or external partner entry';
COMMENT ON COLUMN public.club_members.join_kind IS 'existing_unlisted | new | external_partner | guest (tournament-link profiles, pending club confirmation)';

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS allow_external_entries boolean NOT NULL DEFAULT false;

ALTER TABLE public.club_champs_registrations
  ADD COLUMN IF NOT EXISTS entered_by_member_id uuid;

CREATE TABLE IF NOT EXISTS public.tournament_join_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  champ_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  club_member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  note text
);
CREATE UNIQUE INDEX IF NOT EXISTS tournament_join_claims_one_pending
  ON public.tournament_join_claims (champ_id, club_member_id) WHERE status = 'pending';
GRANT SELECT ON public.tournament_join_claims TO authenticated;
GRANT ALL ON public.tournament_join_claims TO service_role;
ALTER TABLE public.tournament_join_claims ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Claimant or organiser can view join claims" ON public.tournament_join_claims
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_manage_tournament(auth.uid(), champ_id));

-- Helpers
CREATE OR REPLACE FUNCTION public._tournament_join_open(p_champ_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.club_champs c
    JOIN public.tournament_governance g ON g.tournament_id = c.id
    WHERE c.id = p_champ_id
      AND g.eligibility_scope IN ('association','open')
      AND lower(coalesce(c.status, '')) NOT IN ('completed','cancelled','archived')
      AND (c.registration_closes_at IS NULL OR c.registration_closes_at > now())
  );
$$;

CREATE OR REPLACE FUNCTION public._tournament_join_club_ok(p_champ_id uuid, p_club_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM public.tournament_eligible_club_ids(p_champ_id) e WHERE e.club_id = p_club_id);
$$;

-- Registration row + personal link for a tournament-link entrant (idempotent).
CREATE OR REPLACE FUNCTION public._tournament_join_ensure_entry(p_champ_id uuid, p_member_id uuid, p_source text, p_entered_by uuid DEFAULT NULL)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c record; v_status text; v_token text;
BEGIN
  SELECT entry_fee_cents, payment_required INTO c FROM public.club_champs WHERE id = p_champ_id;
  v_status := CASE WHEN coalesce(c.entry_fee_cents, 0) > 0 AND coalesce(c.payment_required, false) THEN 'pending_payment' ELSE 'invited' END;
  INSERT INTO public.club_champs_registrations
    (champ_id, club_member_id, status, invited_by_admin, invited_at, fee_paid_cents, registration_source, entered_by_member_id)
  VALUES (p_champ_id, p_member_id, v_status, false, now(), 0, p_source, p_entered_by)
  ON CONFLICT (champ_id, club_member_id) DO UPDATE
    SET status = CASE WHEN club_champs_registrations.status = 'cancelled' AND club_champs_registrations.paid_at IS NULL
                      THEN EXCLUDED.status ELSE club_champs_registrations.status END,
        declined_at = CASE WHEN club_champs_registrations.status = 'cancelled' THEN NULL ELSE club_champs_registrations.declined_at END,
        invite_revoked_at = NULL,
        invited_at = coalesce(club_champs_registrations.invited_at, now());
  UPDATE public.club_champs_registrations
     SET invite_token = public.new_invite_token(), invite_token_created_at = now()
   WHERE champ_id = p_champ_id AND club_member_id = p_member_id AND invite_token IS NULL;
  SELECT invite_token INTO v_token FROM public.club_champs_registrations
   WHERE champ_id = p_champ_id AND club_member_id = p_member_id;
  RETURN v_token;
END $$;
REVOKE ALL ON FUNCTION public._tournament_join_ensure_entry(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;

-- Public context for /t/:id/join
CREATE OR REPLACE FUNCTION public.tournament_join_context(p_champ_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c record; t record; v_scope text; v_host record; v_clubs jsonb; v_cats jsonb; v_me jsonb := '[]'::jsonb; v_uid uuid := auth.uid();
BEGIN
  SELECT id, name, club_id, status, start_date, registration_closes_at, entry_fee_cents, group_labels, num_groups
    INTO c FROM public.club_champs WHERE id = p_champ_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('found', false); END IF;
  SELECT beta_lifecycle, allow_external_entries INTO t FROM public.tournaments WHERE id = p_champ_id;
  SELECT eligibility_scope INTO v_scope FROM public.tournament_governance WHERE tournament_id = p_champ_id;
  SELECT name, subdomain INTO v_host FROM public.clubs WHERE id = c.club_id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'club_id', cl.id, 'club_name', cl.name, 'subdomain', cl.subdomain,
           'on_squashhub', public.club_accepts_membership_applications(cl.id),
           'is_host', cl.id = c.club_id) ORDER BY (cl.id = c.club_id) DESC, cl.name), '[]'::jsonb)
    INTO v_clubs
    FROM public.tournament_eligible_club_ids(p_champ_id) e JOIN public.clubs cl ON cl.id = e.club_id;

  SELECT coalesce(jsonb_agg(public.tournament_group_display_label(t.beta_lifecycle, c.group_labels ->> n::text, n) ORDER BY n), '[]'::jsonb)
    INTO v_cats FROM generate_series(1, greatest(coalesce(c.num_groups, 1), 1)) n;

  IF v_uid IS NOT NULL THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'member_id', m.id, 'club_id', m.club_id, 'club_name', cl.name, 'name', m.name,
             'pending', coalesce(m.is_pending_approval, false),
             'token', CASE WHEN r.invite_revoked_at IS NULL THEN r.invite_token END)), '[]'::jsonb)
      INTO v_me
      FROM public.club_members m
      JOIN public.clubs cl ON cl.id = m.club_id
      JOIN public.tournament_eligible_club_ids(p_champ_id) e ON e.club_id = m.club_id
      LEFT JOIN public.club_champs_registrations r ON r.champ_id = p_champ_id AND r.club_member_id = m.id
     WHERE m.user_id = v_uid AND coalesce(m.status::text, 'active') <> 'resigned';
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'open', public._tournament_join_open(p_champ_id),
    'scope', coalesce(v_scope, 'club'),
    'name', c.name, 'host_club_id', c.club_id, 'host_club_name', v_host.name, 'host_subdomain', v_host.subdomain,
    'start_date', c.start_date, 'entries_close', c.registration_closes_at,
    'fee_cents', coalesce(c.entry_fee_cents, 0),
    'allow_external', coalesce(t.allow_external_entries, false),
    'categories', v_cats, 'clubs', v_clubs, 'me', v_me);
END $$;
GRANT EXECUTE ON FUNCTION public.tournament_join_context(uuid) TO anon, authenticated;

-- Search one eligible club's list for an unclaimed profile (names only, never contact details).
CREATE OR REPLACE FUNCTION public.tournament_join_find_member(p_champ_id uuid, p_club_id uuid, p_query text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_q text := btrim(coalesce(p_query, '')); v_rows jsonb;
BEGIN
  IF length(v_q) < 3 THEN RETURN '[]'::jsonb; END IF;
  IF NOT public._tournament_join_open(p_champ_id) OR NOT public._tournament_join_club_ok(p_champ_id, p_club_id) THEN
    RAISE EXCEPTION 'Entries through this link are not open';
  END IF;
  SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO v_rows FROM (
    SELECT jsonb_build_object(
             'member_id', m.id, 'display_name', m.name,
             'nsa_on_file', EXISTS (SELECT 1 FROM public.member_association_affiliations a WHERE a.club_member_id = m.id AND a.active),
             'matched_by', CASE WHEN EXISTS (SELECT 1 FROM public.member_association_affiliations a
                                              WHERE a.club_member_id = m.id AND a.active
                                                AND upper(btrim(a.league_association_number)) = upper(v_q)) THEN 'nsa' ELSE 'name' END) AS x
      FROM public.club_members m
     WHERE m.club_id = p_club_id
       AND m.user_id IS NULL
       AND coalesce(m.status::text, 'active') = 'active'
       AND m.role <> 'visitor'
       AND (m.name ILIKE '%' || v_q || '%'
            OR EXISTS (SELECT 1 FROM public.member_association_affiliations a
                        WHERE a.club_member_id = m.id AND a.active
                          AND upper(btrim(a.league_association_number)) = upper(v_q)))
     ORDER BY m.name
     LIMIT 8) s;
  RETURN v_rows;
END $$;
GRANT EXECUTE ON FUNCTION public.tournament_join_find_member(uuid, uuid, text) TO anon, authenticated;

-- Claim a listed profile: NSA number match links now; otherwise the organiser approves.
CREATE OR REPLACE FUNCTION public.tournament_join_claim(p_champ_id uuid, p_member_id uuid, p_nsa_number text DEFAULT NULL, p_phone text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); m record; v_existing uuid; v_nsa text := upper(btrim(coalesce(p_nsa_number, ''))); v_token text; v_claim record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Please sign in first'; END IF;
  IF NOT public._tournament_join_open(p_champ_id) THEN RAISE EXCEPTION 'Entries through this link are not open'; END IF;
  SELECT * INTO m FROM public.club_members WHERE id = p_member_id;
  IF NOT FOUND OR m.role = 'visitor' OR coalesce(m.status::text, 'active') <> 'active'
     OR NOT public._tournament_join_club_ok(p_champ_id, m.club_id) THEN
    RAISE EXCEPTION 'That profile cannot be claimed here';
  END IF;
  IF m.user_id = v_uid THEN
    RETURN jsonb_build_object('status', 'linked', 'member_id', m.id, 'token', public._tournament_join_ensure_entry(p_champ_id, m.id, 'tournament_link'));
  END IF;
  IF m.user_id IS NOT NULL THEN RAISE EXCEPTION 'That profile already belongs to another login. Please sign in with that account.'; END IF;
  SELECT id INTO v_existing FROM public.club_members
   WHERE club_id = m.club_id AND user_id = v_uid AND coalesce(status::text, 'active') <> 'resigned' LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'Your login already has a profile at this club. Use "I already use SquashHub" instead.';
  END IF;

  IF v_nsa <> '' AND EXISTS (SELECT 1 FROM public.member_association_affiliations a
                              WHERE a.club_member_id = m.id AND a.active AND upper(btrim(a.league_association_number)) = v_nsa) THEN
    PERFORM set_config('app.activation_claim', '1', true);
    UPDATE public.club_members
       SET user_id = v_uid, phone = coalesce(nullif(btrim(phone), ''), nullif(btrim(p_phone), ''))
     WHERE id = m.id AND user_id IS NULL;
    PERFORM set_config('app.activation_claim', '', true);
    IF NOT EXISTS (SELECT 1 FROM public.club_members WHERE id = m.id AND user_id = v_uid) THEN
      RAISE EXCEPTION 'The profile could not be linked. Please try again.';
    END IF;
    INSERT INTO public.audit_events (club_id, actor_user_id, action, entity_type, entity_id, after_data)
    VALUES (m.club_id, v_uid, 'tournament_join_claim_nsa', 'club_member', m.id, jsonb_build_object('tournament_id', p_champ_id));
    v_token := public._tournament_join_ensure_entry(p_champ_id, m.id, 'tournament_link');
    RETURN jsonb_build_object('status', 'linked', 'member_id', m.id, 'token', v_token);
  END IF;

  SELECT * INTO v_claim FROM public.tournament_join_claims WHERE champ_id = p_champ_id AND club_member_id = m.id AND status = 'pending';
  IF FOUND AND v_claim.user_id <> v_uid THEN
    RAISE EXCEPTION 'Someone has already asked to claim this profile. The organiser will check it.';
  END IF;
  IF NOT FOUND THEN
    INSERT INTO public.tournament_join_claims (champ_id, club_member_id, user_id) VALUES (p_champ_id, m.id, v_uid);
  END IF;
  v_token := public._tournament_join_ensure_entry(p_champ_id, m.id, 'tournament_link_claim');
  RETURN jsonb_build_object('status', 'pending_claim', 'member_id', m.id, 'token', v_token);
END $$;
GRANT EXECUTE ON FUNCTION public.tournament_join_claim(uuid, uuid, text, text) TO authenticated;

-- Register at the player's own club: existing member not on the list, or a new member.
CREATE OR REPLACE FUNCTION public.tournament_join_register(p_champ_id uuid, p_club_id uuid, p_kind text, p_name text, p_gender text, p_phone text DEFAULT NULL, p_email text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); v_existing uuid; v_person uuid; v_id uuid; v_name text := btrim(coalesce(p_name, ''));
        v_champ text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Please sign in first'; END IF;
  IF p_kind NOT IN ('existing_unlisted', 'new') THEN RAISE EXCEPTION 'Choose how you are joining'; END IF;
  IF NOT public._tournament_join_open(p_champ_id) OR NOT public._tournament_join_club_ok(p_champ_id, p_club_id) THEN
    RAISE EXCEPTION 'Entries through this link are not open for that club';
  END IF;
  IF position(' ' IN v_name) = 0 OR length(v_name) < 4 THEN RAISE EXCEPTION 'Please enter your first name and surname'; END IF;

  SELECT id INTO v_existing FROM public.club_members
   WHERE club_id = p_club_id AND user_id = v_uid AND coalesce(status::text, 'active') <> 'resigned' LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'existing', 'member_id', v_existing,
      'token', public._tournament_join_ensure_entry(p_champ_id, v_existing, 'tournament_link'));
  END IF;

  SELECT id INTO v_person FROM public.people WHERE auth_user_id = v_uid AND merged_into_person_id IS NULL LIMIT 1;
  IF v_person IS NULL THEN
    SELECT person_id INTO v_person FROM public.club_members WHERE user_id = v_uid AND person_id IS NOT NULL LIMIT 1;
  END IF;

  PERFORM set_config('app.tournament_join', '1', true);
  INSERT INTO public.club_members
    (club_id, user_id, name, gender, phone, email, role, status, is_pending_approval, billing_exempt,
     applied_at, join_source, join_kind, joined_via_tournament_id, person_id)
  VALUES
    (p_club_id, v_uid, v_name, nullif(btrim(p_gender), ''), nullif(btrim(p_phone), ''), nullif(lower(btrim(p_email)), ''),
     'member', 'active', true, true, now(), 'tournament_link', p_kind, p_champ_id, v_person)
  RETURNING id INTO v_id;
  PERFORM set_config('app.tournament_join', '', true);

  SELECT name INTO v_champ FROM public.club_champs WHERE id = p_champ_id;
  INSERT INTO public.notifications (user_id, type, title, message, url, data)
  SELECT DISTINCT cm.user_id, 'membership_application', 'Joined via tournament',
         v_name || CASE WHEN p_kind = 'existing_unlisted' THEN ' says they are an existing member (not on your list)' ELSE ' joined as a new member' END
           || ' through ' || coalesce(v_champ, 'a tournament') || '. Please confirm or remove them.',
         '/club-admin?tab=members&filter=pending',
         jsonb_build_object('club_member_id', v_id, 'club_id', p_club_id, 'tournament_id', p_champ_id)
    FROM public.club_members cm
   WHERE cm.club_id = p_club_id AND cm.user_id IS NOT NULL AND cm.id <> v_id
     AND (cm.role = 'admin' OR public.has_club_permission(cm.user_id, p_club_id, 'members'));

  INSERT INTO public.audit_events (club_id, actor_user_id, action, entity_type, entity_id, after_data)
  VALUES (p_club_id, v_uid, 'tournament_join_register', 'club_member', v_id, jsonb_build_object('tournament_id', p_champ_id, 'kind', p_kind));

  RETURN jsonb_build_object('status', 'registered', 'member_id', v_id,
    'token', public._tournament_join_ensure_entry(p_champ_id, v_id, 'tournament_link'));
END $$;
GRANT EXECUTE ON FUNCTION public.tournament_join_register(uuid, uuid, text, text, text, text, text) TO authenticated;

-- Signed-in player with an eligible profile: open (or create) their entry.
CREATE OR REPLACE FUNCTION public.tournament_join_enter(p_champ_id uuid, p_member_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE m record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in first'; END IF;
  IF NOT public._tournament_join_open(p_champ_id) THEN RAISE EXCEPTION 'Entries through this link are not open'; END IF;
  SELECT * INTO m FROM public.club_members WHERE id = p_member_id AND user_id = auth.uid();
  IF NOT FOUND OR NOT public._tournament_join_club_ok(p_champ_id, m.club_id) THEN
    RAISE EXCEPTION 'That profile is not eligible for this tournament';
  END IF;
  RETURN jsonb_build_object('status', 'ok', 'member_id', m.id, 'token', public._tournament_join_ensure_entry(p_champ_id, m.id, 'tournament_link'));
END $$;
GRANT EXECUTE ON FUNCTION public.tournament_join_enter(uuid, uuid) TO authenticated;

-- Organiser: pending name-only claims.
CREATE OR REPLACE FUNCTION public.tournament_join_pending_claims(p_champ_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_tournament(auth.uid(), p_champ_id) THEN
    RAISE EXCEPTION 'Not authorised to manage this tournament';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'id', j.id, 'member_id', m.id, 'member_name', m.name, 'club_name', cl.name,
           'claimant_email', coalesce(p.email, au.email), 'created_at', j.created_at) ORDER BY j.created_at), '[]'::jsonb)
    INTO v
    FROM public.tournament_join_claims j
    JOIN public.club_members m ON m.id = j.club_member_id
    JOIN public.clubs cl ON cl.id = m.club_id
    LEFT JOIN public.profiles p ON p.id = j.user_id
    LEFT JOIN auth.users au ON au.id = j.user_id
   WHERE j.champ_id = p_champ_id AND j.status = 'pending';
  RETURN v;
END $$;
GRANT EXECUTE ON FUNCTION public.tournament_join_pending_claims(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.tournament_join_review_claim(p_claim_id uuid, p_approve boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE j record; m record; v_conflict uuid; r record;
BEGIN
  SELECT * INTO j FROM public.tournament_join_claims WHERE id = p_claim_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Claim not found'; END IF;
  IF auth.uid() IS NULL OR NOT public.can_manage_tournament(auth.uid(), j.champ_id) THEN
    RAISE EXCEPTION 'Not authorised to manage this tournament';
  END IF;
  IF j.status <> 'pending' THEN RAISE EXCEPTION 'This claim was already reviewed'; END IF;
  SELECT * INTO m FROM public.club_members WHERE id = j.club_member_id;

  IF p_approve THEN
    IF m.user_id IS NOT NULL AND m.user_id <> j.user_id THEN RAISE EXCEPTION 'That profile was claimed by another login in the meantime'; END IF;
    SELECT id INTO v_conflict FROM public.club_members
     WHERE club_id = m.club_id AND user_id = j.user_id AND id <> m.id AND coalesce(status::text, 'active') <> 'resigned' LIMIT 1;
    IF v_conflict IS NOT NULL THEN RAISE EXCEPTION 'The claimant already has another profile at this club'; END IF;
    PERFORM set_config('app.tournament_join_link', j.user_id::text, true);
    UPDATE public.club_members SET user_id = j.user_id WHERE id = m.id AND user_id IS NULL;
    PERFORM set_config('app.tournament_join_link', '', true);
    UPDATE public.tournament_join_claims SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now() WHERE id = j.id;
  ELSE
    UPDATE public.tournament_join_claims SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now() WHERE id = j.id;
    SELECT * INTO r FROM public.club_champs_registrations WHERE champ_id = j.champ_id AND club_member_id = m.id;
    IF FOUND AND r.paid_at IS NULL AND coalesce(r.fee_paid_cents, 0) = 0 AND r.registration_source = 'tournament_link_claim' THEN
      UPDATE public.club_champs_registrations SET status = 'cancelled', invite_revoked_at = now() WHERE id = r.id;
    END IF;
  END IF;
  INSERT INTO public.audit_events (club_id, actor_user_id, action, entity_type, entity_id, after_data)
  VALUES (m.club_id, auth.uid(), CASE WHEN p_approve THEN 'tournament_join_claim_approved' ELSE 'tournament_join_claim_rejected' END,
          'club_member', m.id, jsonb_build_object('tournament_id', j.champ_id, 'claimant', j.user_id));
  RETURN jsonb_build_object('ok', true);
END $$;
GRANT EXECUTE ON FUNCTION public.tournament_join_review_claim(uuid, boolean) TO authenticated;

-- Names for the organiser's invite list, including players without any contact details.
CREATE OR REPLACE FUNCTION public.tournament_invite_member_names(p_tournament_id uuid, p_member_ids uuid[])
RETURNS TABLE(member_id uuid, display_name text, club_name text, reachable boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_club uuid;
BEGIN
  SELECT club_id INTO v_club FROM public.tournaments WHERE id = p_tournament_id;
  IF NOT public.can_browse_invite_directory(auth.uid(), p_tournament_id, v_club) THEN
    RAISE EXCEPTION 'Not authorised to view this invitation list';
  END IF;
  RETURN QUERY
  SELECT m.id, coalesce(nullif(btrim(m.name), ''), 'Unknown player')::text, coalesce(cl.name, '')::text,
         (m.user_id IS NOT NULL OR nullif(btrim(coalesce(m.email, '')), '') IS NOT NULL
          OR length(regexp_replace(coalesce(m.phone, ''), '\D', '', 'g')) >= 9)
    FROM public.club_members m
    LEFT JOIN public.clubs cl ON cl.id = m.club_id
   WHERE m.id = ANY(coalesce(p_member_ids, '{}'))
     AND (m.club_id = v_club OR m.club_id IN (SELECT e.club_id FROM public.tournament_eligible_club_ids(p_tournament_id) e));
END $$;
GRANT EXECUTE ON FUNCTION public.tournament_invite_member_names(uuid, uuid[]) TO authenticated;

-- Player enters (and pays for) a partner from outside the invite list.
CREATE OR REPLACE FUNCTION public.propose_doubles_partner_external(
  p_champ_id uuid, p_group_number integer, p_token text DEFAULT NULL, p_verify text DEFAULT NULL,
  p_partner_member_id uuid DEFAULT NULL, p_club_id uuid DEFAULT NULL, p_name text DEFAULT NULL,
  p_gender text DEFAULT NULL, p_phone text DEFAULT NULL, p_email text DEFAULT NULL, p_consent boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_me uuid; v_host uuid; v_partner uuid; m record; v_name text := btrim(coalesce(p_name, ''));
BEGIN
  v_me := public.champ_actor_member(p_champ_id, p_token, p_verify);
  SELECT club_id INTO v_host FROM public.tournaments WHERE id = p_champ_id AND allow_external_entries;
  IF v_host IS NULL THEN RAISE EXCEPTION 'This tournament does not allow entering a partner from outside'; END IF;
  IF NOT public.champ_division_is_doubles(p_champ_id, p_group_number) THEN RAISE EXCEPTION 'This division is not a doubles division'; END IF;
  IF public.champ_pairing_locked(p_champ_id) THEN RAISE EXCEPTION 'Doubles pairs are locked by the organiser'; END IF;

  IF p_partner_member_id IS NOT NULL THEN
    SELECT * INTO m FROM public.club_members WHERE id = p_partner_member_id;
    IF NOT FOUND OR coalesce(m.status::text, 'active') <> 'active'
       OR NOT (m.club_id = v_host OR public._tournament_join_club_ok(p_champ_id, m.club_id)) THEN
      RAISE EXCEPTION 'That player cannot be entered in this tournament';
    END IF;
    v_partner := m.id;
  ELSE
    IF NOT coalesce(p_consent, false) THEN RAISE EXCEPTION 'Please confirm your partner agreed to be entered'; END IF;
    IF position(' ' IN v_name) = 0 OR length(v_name) < 4 THEN RAISE EXCEPTION 'Please enter your partner''s first name and surname'; END IF;
    IF nullif(btrim(coalesce(p_gender, '')), '') IS NULL THEN RAISE EXCEPTION 'Please choose your partner''s gender'; END IF;
    IF p_club_id IS NOT NULL AND NOT public._tournament_join_club_ok(p_champ_id, p_club_id) THEN
      RAISE EXCEPTION 'That club is not part of this tournament';
    END IF;
    PERFORM set_config('app.tournament_join', '1', true);
    INSERT INTO public.club_members
      (club_id, user_id, name, gender, phone, email, role, status, is_pending_approval, billing_exempt,
       applied_at, join_source, join_kind, joined_via_tournament_id)
    VALUES
      (coalesce(p_club_id, v_host), NULL, v_name, btrim(p_gender), nullif(btrim(p_phone), ''), nullif(lower(btrim(p_email)), ''),
       CASE WHEN p_club_id IS NULL THEN 'visitor'::club_member_role ELSE 'member'::club_member_role END,
       'active', p_club_id IS NOT NULL, true, now(), 'tournament_link',
       CASE WHEN p_club_id IS NULL THEN 'guest' ELSE 'external_partner' END, p_champ_id)
    RETURNING id INTO v_partner;
    PERFORM set_config('app.tournament_join', '', true);
    INSERT INTO public.audit_events (club_id, actor_user_id, action, entity_type, entity_id, after_data)
    VALUES (coalesce(p_club_id, v_host), auth.uid(), 'tournament_external_partner_created', 'club_member', v_partner,
            jsonb_build_object('tournament_id', p_champ_id, 'entered_by_member', v_me));
  END IF;
  IF v_partner = v_me THEN RAISE EXCEPTION 'You cannot pair with yourself'; END IF;

  PERFORM public._tournament_join_ensure_entry(p_champ_id, v_partner, 'external_partner', v_me);
  -- No partner confirmation: the entering player's word stands (organiser can remove).
  UPDATE public.club_champs_registrations
     SET division_choices = (SELECT array_agg(DISTINCT x ORDER BY x) FROM unnest(coalesce(division_choices, '{}') || p_group_number) x),
         confirmed_at = coalesce(confirmed_at, now()),
         confirmed_by = coalesce(confirmed_by, auth.uid()),
         confirmation_source = coalesce(confirmation_source, 'invite_link'),
         entered_by_member_id = coalesce(entered_by_member_id, v_me)
   WHERE champ_id = p_champ_id AND club_member_id = v_partner;

  RETURN public.propose_doubles_partner(p_champ_id, p_group_number, v_partner, p_token, p_verify, true);
END $$;
GRANT EXECUTE ON FUNCTION public.propose_doubles_partner_external(uuid, integer, text, text, uuid, uuid, text, text, text, text, boolean) TO anon, authenticated;

-- Member account charges: host-club members, or players who also hold a (non-visitor) host-club membership.
CREATE OR REPLACE FUNCTION public._champ_account_allowed(p_member_id uuid, p_host_club_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.club_members m
    WHERE m.id = p_member_id
      AND (m.club_id = p_host_club_id
           OR EXISTS (SELECT 1 FROM public.club_members h
                      WHERE h.club_id = p_host_club_id AND h.role <> 'visitor'
                        AND coalesce(h.status::text, 'active') = 'active'
                        AND ((m.person_id IS NOT NULL AND h.person_id = m.person_id)
                          OR (m.user_id IS NOT NULL AND h.user_id = m.user_id))))
  );
$$;

-- Member account charges exist only at the host club.
CREATE OR REPLACE FUNCTION public.invite_payment_options(p_token text)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_id uuid; r record; v_methods text[]; v_host uuid;
BEGIN
  v_id := public._invite_reg_id(p_token);
  IF v_id IS NULL THEN RETURN jsonb_build_object('ok', false); END IF;
  SELECT * INTO r FROM public.club_champs_registrations WHERE id = v_id;
  v_methods := public._champ_payment_methods(r.champ_id);
  SELECT club_id INTO v_host FROM public.tournaments WHERE id = r.champ_id;
  IF NOT public._champ_account_allowed(r.club_member_id, v_host) THEN
    v_methods := array_remove(v_methods, 'account');
  END IF;
  RETURN jsonb_build_object('ok', true,
    'methods', to_jsonb(v_methods),
    'amount_cents', public._invite_amount_cents(v_id),
    'status', r.status, 'fee_settled_via', r.fee_settled_via);
END $function$;

CREATE OR REPLACE FUNCTION public.club_members_guard_self_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  actor uuid := auth.uid();
  is_admin boolean;
  v_open boolean;
  v_mode text;
  v_auto_number boolean;
  v_has_admin boolean;
  v_activation_claim boolean := coalesce(current_setting('app.activation_claim', true), '') = '1';
  v_self_application boolean := false;
BEGIN
  IF actor IS NULL THEN RETURN NEW; END IF;

  -- Family package additions are pending member rows created by
  -- family_add_member; they are not self sign-up applications and must keep
  -- the role, category and pending-approval state the RPC set.
  -- Tournament open-link profiles (tournament_join_register / external partner) likewise.
  IF TG_OP = 'INSERT' AND (coalesce(current_setting('app.family_add', true), '') = '1'
      OR coalesce(current_setting('app.tournament_join', true), '') = '1') THEN
    RETURN NEW;
  END IF;

  is_admin := public.is_club_admin(actor, COALESCE(NEW.club_id, OLD.club_id))
              OR public.has_role(actor, 'admin'::app_role)
              OR (TG_OP = 'UPDATE' AND public.is_club_member_manager(actor, OLD.club_id, OLD.user_id) AND OLD.role <> 'admin'::club_member_role);
  IF is_admin THEN RETURN NEW; END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.user_id IS DISTINCT FROM actor THEN RETURN NEW; END IF;
    SELECT c.public_applications_enabled, c.member_activation_mode, c.auto_number_existing_onboarding
      INTO v_open, v_mode, v_auto_number FROM public.clubs c WHERE c.id = NEW.club_id;
    IF v_open IS NULL THEN RAISE EXCEPTION 'Club not found'; END IF;
    IF v_open = false THEN
      RAISE EXCEPTION 'This club is not accepting membership applications. Please contact the club directly.' USING ERRCODE = '42501';
    END IF;

    SELECT EXISTS (SELECT 1 FROM public.club_members a
                   WHERE a.club_id = NEW.club_id AND a.role = 'admin' AND a.user_id IS NOT NULL)
      INTO v_has_admin;

    NEW.role := CASE WHEN v_has_admin THEN 'member'::club_member_role ELSE 'admin'::club_member_role END;
    NEW.billing_exempt := false;
    NEW.suspension_status := 'active'::member_suspension_status;
    NEW.suspension_outstanding := 0;
    NEW.suspension_manual := false;
    NEW.suspended_at := NULL;
    NEW.suspension_cleared_at := NULL;
    NEW.suspension_reason := NULL;
    NEW.access_suspended_at := NULL;
    NEW.ranking_points := 0;
    NEW.ladder_position := NULL;
    NEW.club_member_number := CASE WHEN COALESCE(v_auto_number, false) THEN public.allocate_next_member_number(NEW.club_id) ELSE NULL END;
    NEW.status := 'active'::member_status;
    NEW.pending_captain_claim := COALESCE(NEW.pending_captain_claim, false);
    NEW.applied_at := now();
    NEW.is_pending_approval := v_has_admin AND (COALESCE(v_mode, 'auto_on_payment') <> 'immediate');
    NEW.approved_at := CASE WHEN NEW.is_pending_approval THEN NULL ELSE now() END;
    NEW.approved_by := NULL;
    RETURN NEW;
  END IF;

  -- A person's own unfinished signup application may choose its FIRST fee
  -- category (the signup steps). Assigned categories stay locked, and imported
  -- / admin-created members can never pick one themselves.
  IF OLD.user_id = actor AND OLD.fee_category_id IS NULL AND NEW.fee_category_id IS NOT NULL THEN
    SELECT (OLD.is_pending_approval OR OLD.applied_at IS NOT NULL
            OR abs(extract(epoch FROM (OLD.joined_at - u.created_at))) < 600)
      INTO v_self_application
      FROM auth.users u WHERE u.id = actor;
    v_self_application := COALESCE(v_self_application, false)
      AND EXISTS (SELECT 1 FROM public.member_fee_categories f
                  WHERE f.id = NEW.fee_category_id AND f.club_id = OLD.club_id);
  END IF;

  SELECT c.auto_number_existing_onboarding INTO v_auto_number FROM public.clubs c WHERE c.id = OLD.club_id;
  NEW.club_id := OLD.club_id;
  NEW.user_id := CASE
    WHEN v_activation_claim AND OLD.user_id IS NULL AND NEW.user_id = actor THEN NEW.user_id
    -- Organiser-approved tournament profile claim (tournament_join_review_claim).
    WHEN OLD.user_id IS NULL AND NEW.user_id IS NOT NULL
         AND NEW.user_id::text = coalesce(current_setting('app.tournament_join_link', true), '') THEN NEW.user_id
    ELSE OLD.user_id END;
  NEW.role := OLD.role;
  NEW.status := OLD.status;
  NEW.club_member_number := CASE
    WHEN OLD.club_member_number IS NULL AND COALESCE(v_auto_number, false) AND NEW.user_id = actor
    THEN public.allocate_next_member_number(OLD.club_id) ELSE OLD.club_member_number END;
  NEW.fee_category_id := CASE WHEN v_self_application THEN NEW.fee_category_id ELSE OLD.fee_category_id END;
  NEW.billing_exempt := OLD.billing_exempt;
  NEW.suspension_status := OLD.suspension_status;
  NEW.suspension_outstanding := OLD.suspension_outstanding;
  NEW.suspension_reason := OLD.suspension_reason;
  NEW.suspension_manual := OLD.suspension_manual;
  NEW.suspended_at := OLD.suspended_at;
  NEW.suspension_cleared_at := OLD.suspension_cleared_at;
  NEW.access_suspended_at := OLD.access_suspended_at;
  NEW.ranking_points := OLD.ranking_points;
  NEW.ladder_position := OLD.ladder_position;
  NEW.person_id := OLD.person_id;
  NEW.is_league_only_membership := OLD.is_league_only_membership;
  NEW.enable_league_association_id := OLD.enable_league_association_id;
  NEW.joined_at := OLD.joined_at;
  NEW.face_provisioned_at := OLD.face_provisioned_at;
  NEW.face_provider_person_id := OLD.face_provider_person_id;
  NEW.is_pending_approval := OLD.is_pending_approval;
  NEW.applied_at := OLD.applied_at;
  NEW.approved_at := OLD.approved_at;
  NEW.approved_by := OLD.approved_by;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_default_ladder_rank()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_group text;
  v_max integer;
BEGIN
  -- Tournament-link pending profiles stay off the club ladder until the club confirms them.
  IF coalesce(current_setting('app.tournament_join', true), '') = '1' THEN
    RETURN NEW;
  END IF;
  IF NEW.ladder_position IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_group := CASE
    WHEN lower(COALESCE(NEW.gender, '')) IN ('female', 'ladies', 'f') THEN 'ladies'
    ELSE 'men'
  END;

  SELECT COALESCE(MAX(cm.ladder_position), 0)
  INTO v_max
  FROM public.club_members cm
  WHERE cm.club_id = NEW.club_id
    AND cm.id IS DISTINCT FROM NEW.id
    AND cm.ladder_position IS NOT NULL
    AND (
      (v_group = 'ladies' AND lower(COALESCE(cm.gender, '')) IN ('female', 'ladies', 'f'))
      OR
      (v_group = 'men' AND lower(COALESCE(cm.gender, '')) NOT IN ('female', 'ladies', 'f'))
    );

  NEW.ladder_position := v_max + 1;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.invite_settle_entry(p_token text, p_verify text, p_method text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid; r record; m record; c record; v_amount int; v_bank record; p record;
        v_partner uuid; v_preg uuid; v_bill uuid; v_pname text; v_fee numeric; v_fee_id uuid; v_claim uuid;
BEGIN
  IF p_method NOT IN ('account','eft','cash','already_paid') THEN RAISE EXCEPTION 'Choose a payment method'; END IF;
  v_id := public._invite_reg_id(p_token);
  IF v_id IS NULL THEN RAISE EXCEPTION 'This invitation is no longer valid'; END IF;
  SELECT * INTO r FROM public.club_champs_registrations WHERE id = v_id FOR UPDATE;
  SELECT * INTO m FROM public.club_members WHERE id = r.club_member_id;
  IF NOT ((auth.uid() IS NOT NULL AND (m.user_id = auth.uid() OR public.member_is_delegate_of(m.id, auth.uid())))
          OR public.invite_verification_ok(m.id, p_verify)) THEN
    RAISE EXCEPTION 'Please verify this invitation first';
  END IF;
  -- Organiser-entered players are 'invited' but already confirmed: their entry stands, so they may pay.
  IF lower(coalesce(r.status,'')) IN ('cancelled','declined','withdrawn')
     OR (lower(coalesce(r.status,'')) = 'invited' AND r.confirmed_at IS NULL) THEN
    RAISE EXCEPTION 'Enter the tournament before paying';
  END IF;
  IF p_method <> 'already_paid' AND NOT (p_method = ANY(public._champ_payment_methods(r.champ_id))) THEN
    RAISE EXCEPTION 'That payment method is not available for this tournament';
  END IF;
  -- Charge-to-account only for players who already have a membership at the host club.
  IF p_method = 'account' AND NOT public._champ_account_allowed(m.id, (SELECT t.club_id FROM public.tournaments t WHERE t.id = r.champ_id)) THEN
    RAISE EXCEPTION 'Charge to account is only for members of the host club. Please choose another payment method.';
  END IF;
  SELECT id, name, club_id, start_date INTO c FROM public.club_champs WHERE id = r.champ_id;
  v_amount := public._invite_amount_cents(v_id);
  IF v_amount <= 0 THEN RETURN jsonb_build_object('ok', true, 'nothing_due', true); END IF;

  v_fee_id := public.ensure_tournament_entry_fee(v_id);

  IF p_method = 'already_paid' THEN
    -- Recorded as a payment claim for admin verification; never marks paid here.
    SELECT cl.id INTO v_claim FROM public.champ_payment_claims cl
      JOIN public.champ_payment_claim_allocations a ON a.claim_id = cl.id
     WHERE cl.champ_id = r.champ_id AND a.registration_id = v_id AND cl.status IN ('reported','needs_proof')
     LIMIT 1;
    IF v_claim IS NULL THEN
      INSERT INTO public.champ_payment_claims (club_id, champ_id, claimant_user_id, recorded_by_admin, method, paid_on, reference, amount_cents)
      VALUES (c.club_id, r.champ_id, auth.uid(), false, 'eft', current_date, 'Reported via invitation link', v_amount)
      RETURNING id INTO v_claim;
      INSERT INTO public.champ_payment_claim_allocations (claim_id, club_member_id, registration_id, fee_payment_id, amount_cents, created_by)
      VALUES (v_claim, r.club_member_id, v_id, v_fee_id, v_amount, auth.uid());
    END IF;
    RETURN jsonb_build_object('ok', true, 'method', 'already_paid', 'amount_cents', v_amount, 'claim_id', v_claim);
  END IF;

  IF p_method = 'account' THEN
    UPDATE public.club_champs_registrations SET fee_settled_via = 'account', fee_settled_via_at = now()
     WHERE id = v_id AND fee_settled_via IS NULL AND paid_at IS NULL;
    FOR p IN SELECT * FROM public.champ_doubles_pairs
              WHERE champ_id = r.champ_id AND pays_for_partner AND payer_member_id = r.club_member_id
                AND status IN ('awaiting_payment','pending') LOOP
      v_partner := CASE WHEN p.member_a = r.club_member_id THEN p.member_b ELSE p.member_a END;
      IF public.champ_member_event_paid(r.champ_id, v_partner, p.group_number) THEN CONTINUE; END IF;
      SELECT id INTO v_preg FROM public.club_champs_registrations
       WHERE champ_id = r.champ_id AND club_member_id = v_partner
         AND lower(coalesce(status,'')) NOT IN ('cancelled','declined','withdrawn')
       ORDER BY created_at DESC LIMIT 1;
      IF v_preg IS NULL THEN CONTINUE; END IF;
      v_bill := public.resolve_host_billing_member(r.club_member_id, c.club_id);
      v_fee := public.champ_division_fee_cents(r.champ_id, p.group_number)::numeric / 100;
      SELECT name INTO v_pname FROM public.club_members WHERE id = v_partner;
      INSERT INTO public.club_member_fee_payments (club_member_id, fee_type, fee_label, amount, paid, season_year)
      VALUES (v_bill, 'tournament_entry', coalesce(c.name,'Tournament') || ' entry fee – for ' || coalesce(v_pname,'partner')
              || ' (' || public.champ_group_label(r.champ_id, p.group_number) || ')', v_fee, false,
              EXTRACT(YEAR FROM coalesce(c.start_date, now()))::int)
      ON CONFLICT (club_member_id, fee_type, fee_label, season_year) DO UPDATE SET updated_at = now();
      PERFORM public.champ_mark_event_cover(v_preg, p.group_number, r.club_member_id, 'account', NULL);
      PERFORM public.champ_pair_settle(p.id);
    END LOOP;
    FOR p IN SELECT id FROM public.champ_doubles_pairs WHERE champ_id = r.champ_id
              AND r.club_member_id IN (member_a, member_b) AND status = 'awaiting_payment' LOOP
      PERFORM public.champ_pair_settle(p.id);
    END LOOP;
    RETURN jsonb_build_object('ok', true, 'method', 'account', 'amount_cents', v_amount);
  END IF;

  UPDATE public.club_champs_registrations SET status = CASE WHEN p_method = 'eft' THEN 'pending_eft' ELSE status END
   WHERE id = v_id AND status = 'pending_payment';

  IF p_method = 'eft' THEN
    SELECT s.bank_name, s.bank_account_name, s.bank_account_number, s.bank_branch_code
      INTO v_bank FROM public.club_secrets s WHERE s.club_id = c.club_id LIMIT 1;
    RETURN jsonb_build_object('ok', true, 'method', 'eft', 'amount_cents', v_amount,
      'bank_name', v_bank.bank_name, 'bank_account_name', v_bank.bank_account_name,
      'bank_account_number', v_bank.bank_account_number, 'bank_branch_code', v_bank.bank_branch_code,
      'reference', left(regexp_replace(coalesce(m.name,'Entry'), '\s+', ' ', 'g'), 20) || ' ' || left(coalesce(c.name,''), 10));
  END IF;
  RETURN jsonb_build_object('ok', true, 'method', 'cash', 'amount_cents', v_amount);
END
$function$;
