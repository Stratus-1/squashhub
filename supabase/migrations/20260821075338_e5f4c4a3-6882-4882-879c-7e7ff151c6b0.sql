-- Divisions available in a tournament, filtered to what a member may enter.
CREATE OR REPLACE FUNCTION public.tournament_division_options(p_champ_id uuid, p_member_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  t record;
  v_gender text;
  i int;
  v_div_gender text;
  v_label text;
  out_arr jsonb := '[]'::jsonb;
BEGIN
  SELECT id, num_groups, gender, group_labels, league_genders, league_formats, league_match_types, match_type
    INTO t FROM public.tournaments WHERE id = p_champ_id;
  IF NOT FOUND THEN RETURN out_arr; END IF;

  IF p_member_id IS NOT NULL THEN
    SELECT lower(COALESCE(gender, '')) INTO v_gender FROM public.club_members WHERE id = p_member_id;
  END IF;

  FOR i IN 1..GREATEST(COALESCE(t.num_groups, 1), 1) LOOP
    v_div_gender := lower(COALESCE(NULLIF(COALESCE(t.league_genders ->> i::text, ''), ''), COALESCE(t.gender, 'open')));
    v_label := NULLIF(COALESCE(t.group_labels ->> i::text, ''), '');
    IF v_label IS NULL THEN v_label := 'League ' || i::text; END IF;

    -- Gender gate: a men's division is not offered to a female member and vice versa.
    IF v_gender IS NULL OR v_gender = ''
       OR v_div_gender IN ('mixed', 'open', '')
       OR (v_div_gender IN ('men', 'male', 'mens') AND v_gender IN ('male', 'man', 'men', 'm'))
       OR (v_div_gender IN ('ladies', 'female', 'women', 'womens') AND v_gender IN ('female', 'woman', 'women', 'f'))
    THEN
      out_arr := out_arr || jsonb_build_object(
        'group_number', i,
        'label', v_label,
        'gender', v_div_gender,
        'format', COALESCE(t.league_formats ->> i::text, ''),
        'match_type', COALESCE(t.league_match_types ->> i::text, t.match_type)
      );
    END IF;
  END LOOP;

  RETURN out_arr;
END;
$fn$;

REVOKE ALL ON FUNCTION public.tournament_division_options(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tournament_division_options(uuid, uuid) TO anon, authenticated, service_role;

-- Materialise a member's chosen divisions as entry rows (idempotent).
CREATE OR REPLACE FUNCTION public.apply_registration_division_choices(p_registration_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r record;
  gn int;
BEGIN
  SELECT * INTO r FROM public.club_champs_registrations WHERE id = p_registration_id;
  IF NOT FOUND OR COALESCE(array_length(r.division_choices, 1), 0) = 0 THEN RETURN; END IF;

  FOREACH gn IN ARRAY r.division_choices LOOP
    INSERT INTO public.club_champs_entries (champ_id, club_member_id, group_number, partner_member_id)
    VALUES (r.champ_id, r.club_member_id, gn, r.partner_member_id)
    ON CONFLICT (champ_id, club_member_id, group_number) DO NOTHING;
  END LOOP;

  -- Divisions the player did not choose must not keep a stale entry.
  DELETE FROM public.club_champs_entries e
   WHERE e.champ_id = r.champ_id
     AND e.club_member_id = r.club_member_id
     AND NOT (e.group_number = ANY (r.division_choices));
END;
$fn$;

REVOKE ALL ON FUNCTION public.apply_registration_division_choices(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_registration_division_choices(uuid) TO authenticated, service_role;

-- Invite payload: add the division picker data.
CREATE OR REPLACE FUNCTION public.get_tournament_invite(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_reg record;
  v_champ record;
  v_club record;
  v_member record;
  v_group int;
  v_label text;
  v_name text;
  v_closed boolean := false;
  v_kind text;
  v_is_invitee boolean;
  v_divisions jsonb;
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT * INTO v_reg FROM public.club_champs_registrations WHERE invite_token = p_token;
  IF NOT FOUND THEN RETURN jsonb_build_object('found', false); END IF;

  SELECT * INTO v_champ FROM public.club_champs WHERE id = v_reg.champ_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('found', false); END IF;

  SELECT id, name, subdomain INTO v_club FROM public.clubs WHERE id = v_champ.club_id;
  SELECT id, name, user_id INTO v_member FROM public.club_members WHERE id = v_reg.club_member_id;

  SELECT e.group_number INTO v_group
    FROM public.club_champs_entries e
   WHERE e.champ_id = v_reg.champ_id AND e.club_member_id = v_reg.club_member_id
   ORDER BY e.group_number LIMIT 1;

  IF v_group IS NOT NULL THEN
    v_label := COALESCE(NULLIF(v_champ.group_labels ->> v_group::text, ''), 'League ' || v_group::text);
  END IF;

  v_divisions := public.tournament_division_options(v_reg.champ_id, v_reg.club_member_id);

  v_name := NULLIF(trim(COALESCE(v_member.name, '')), '');
  IF v_name IS NOT NULL AND position(' ' IN v_name) > 0 THEN
    v_name := split_part(v_name, ' ', 1) || ' ' || upper(left(split_part(v_name, ' ', 2), 1)) || '.';
  END IF;

  IF v_champ.registration_closes_at IS NOT NULL AND now() > v_champ.registration_closes_at THEN
    v_closed := true;
  END IF;

  IF v_reg.invite_viewed_at IS NULL THEN
    UPDATE public.club_champs_registrations SET invite_viewed_at = now() WHERE id = v_reg.id;
  END IF;

  v_is_invitee := auth.uid() IS NOT NULL AND v_member.user_id IS NOT NULL AND auth.uid() = v_member.user_id;
  v_kind := CASE WHEN v_is_invitee THEN 'none' ELSE public.invite_verification_kind(v_reg.club_member_id) END;

  RETURN jsonb_build_object(
    'found', true,
    'champ_id', v_champ.id,
    'tournament_name', v_champ.name,
    'description', v_champ.description,
    'start_date', v_champ.start_date,
    'end_date', v_champ.end_date,
    'registration_closes_at', v_champ.registration_closes_at,
    'registration_opens_at', v_champ.registration_opens_at,
    'entry_fee_cents', COALESCE(v_champ.entry_fee_cents, 0),
    'payment_required', COALESCE(v_champ.payment_required, false),
    'gender', v_champ.gender,
    'match_type', v_champ.match_type,
    'club_name', v_club.name,
    'club_subdomain', v_club.subdomain,
    'division_label', v_label,
    'divisions', v_divisions,
    'selected_divisions', to_jsonb(COALESCE(v_reg.division_choices, '{}')),
    'scheduling_mode', COALESCE(v_champ.scheduling_mode, 'club'),
    'invitee_name', v_name,
    'status', v_reg.status,
    'confirmed_at', v_reg.confirmed_at,
    'declined_at', v_reg.declined_at,
    'viewed_at', COALESCE(v_reg.invite_viewed_at, now()),
    'revoked', v_reg.invite_revoked_at IS NOT NULL,
    'registration_closed', v_closed,
    'tournament_status', v_champ.status,
    'member_has_account', v_member.user_id IS NOT NULL,
    'can_respond_public', true,
    'verification_kind', v_kind,
    'requires_login', false,
    'is_invitee', v_is_invitee
  );
END;
$fn$;

-- Public response: accept division choices.
DROP FUNCTION IF EXISTS public.respond_tournament_invite_public(text, boolean, text);
CREATE OR REPLACE FUNCTION public.respond_tournament_invite_public(
  p_token text,
  p_accept boolean,
  p_verify text DEFAULT NULL,
  p_divisions integer[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_reg record;
  v_champ record;
  v_member record;
  v_fee_id uuid;
  v_amount numeric;
  v_next_status text;
  v_label text;
  v_status text;
  v_allowed int[];
  v_choices int[];
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 THEN
    RAISE EXCEPTION 'This invitation link is not valid';
  END IF;

  SELECT * INTO v_reg FROM public.club_champs_registrations WHERE invite_token = p_token;
  IF NOT FOUND THEN RAISE EXCEPTION 'This invitation link is not valid'; END IF;
  IF v_reg.invite_revoked_at IS NOT NULL THEN RAISE EXCEPTION 'This invitation has been withdrawn'; END IF;

  SELECT id, name, phone, user_id INTO v_member FROM public.club_members WHERE id = v_reg.club_member_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'This invitation link is not valid'; END IF;

  IF NOT (auth.uid() IS NOT NULL AND v_member.user_id IS NOT NULL AND auth.uid() = v_member.user_id) THEN
    IF NOT public.invite_verification_ok(v_reg.club_member_id, p_verify) THEN
      RAISE EXCEPTION 'We could not verify that this invitation is yours. Please check the detail you entered.';
    END IF;
  END IF;

  SELECT * INTO v_champ FROM public.club_champs WHERE id = v_reg.champ_id;
  v_status := lower(COALESCE(v_reg.status, ''));

  IF p_accept AND v_reg.confirmed_at IS NOT NULL
     AND v_status IN ('paid','waived','registered','active','pending_payment','pending_eft')
     AND p_divisions IS NULL THEN
    RETURN jsonb_build_object('status', v_reg.status, 'champ_id', v_reg.champ_id, 'registration_id', v_reg.id, 'already', true);
  END IF;
  IF NOT p_accept AND v_status = 'cancelled' THEN
    RETURN jsonb_build_object('status', 'cancelled', 'champ_id', v_reg.champ_id, 'registration_id', v_reg.id, 'already', true);
  END IF;

  IF p_accept AND v_champ.registration_closes_at IS NOT NULL AND now() > v_champ.registration_closes_at THEN
    RAISE EXCEPTION 'Entries for this tournament have closed';
  END IF;

  IF NOT p_accept THEN
    UPDATE public.club_champs_registrations
       SET status = 'cancelled', confirmed_at = NULL, confirmed_by = NULL,
           confirmation_source = NULL, declined_at = COALESCE(declined_at, now()),
           invite_viewed_at = COALESCE(invite_viewed_at, now())
     WHERE id = v_reg.id;
    RETURN jsonb_build_object('status', 'cancelled', 'champ_id', v_reg.champ_id, 'registration_id', v_reg.id);
  END IF;

  -- Only divisions this member may enter are accepted.
  IF p_divisions IS NOT NULL AND array_length(p_divisions, 1) > 0 THEN
    SELECT array_agg((d ->> 'group_number')::int)
      INTO v_allowed
      FROM jsonb_array_elements(public.tournament_division_options(v_reg.champ_id, v_reg.club_member_id)) d;
    SELECT array_agg(DISTINCT x) INTO v_choices
      FROM unnest(p_divisions) x WHERE x = ANY (COALESCE(v_allowed, '{}'));
    IF COALESCE(array_length(v_choices, 1), 0) = 0 THEN
      RAISE EXCEPTION 'Please choose at least one division you are eligible for';
    END IF;
    UPDATE public.club_champs_registrations SET division_choices = v_choices WHERE id = v_reg.id;
  END IF;

  v_amount := COALESCE(v_champ.entry_fee_cents, 0)::numeric / 100;

  IF COALESCE(v_champ.payment_required, false) AND v_amount > 0 THEN
    v_label := COALESCE(v_champ.name, 'Tournament') || ' entry fee';
    INSERT INTO public.club_member_fee_payments (club_member_id, fee_type, fee_label, amount, paid, season_year)
    VALUES (v_reg.club_member_id, 'tournament_entry', v_label, v_amount, false,
            EXTRACT(YEAR FROM COALESCE(v_champ.start_date, now()))::int)
    ON CONFLICT (club_member_id, fee_type, fee_label, season_year)
    DO UPDATE SET amount = EXCLUDED.amount
    RETURNING id INTO v_fee_id;
    v_next_status := CASE WHEN v_status = 'pending_eft' THEN 'pending_eft' ELSE 'pending_payment' END;
  ELSE
    v_next_status := 'paid';
  END IF;

  UPDATE public.club_champs_registrations
     SET status = v_next_status,
         fee_payment_id = COALESCE(v_fee_id, fee_payment_id),
         confirmed_at = COALESCE(confirmed_at, now()),
         confirmed_by = COALESCE(confirmed_by, auth.uid(), confirmed_by),
         confirmation_source = COALESCE(confirmation_source, 'invite_link'),
         declined_at = NULL,
         invite_viewed_at = COALESCE(invite_viewed_at, now())
   WHERE id = v_reg.id;

  PERFORM public.apply_registration_division_choices(v_reg.id);

  RETURN jsonb_build_object('status', v_next_status, 'fee_payment_id', v_fee_id,
                            'champ_id', v_reg.champ_id, 'registration_id', v_reg.id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.respond_tournament_invite_public(text, boolean, text, integer[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.respond_tournament_invite_public(text, boolean, text, integer[]) TO anon, authenticated, service_role;

-- Signed-in acceptance: same division choices.
DROP FUNCTION IF EXISTS public.accept_tournament_invite(uuid, boolean);
CREATE OR REPLACE FUNCTION public.accept_tournament_invite(
  p_registration_id uuid,
  p_accept boolean,
  p_divisions integer[] DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_reg record;
  v_champ record;
  v_member record;
  v_fee_id uuid;
  v_amount numeric;
  v_next_status text;
  v_label text;
  v_allowed int[];
  v_choices int[];
BEGIN
  SELECT * INTO v_reg FROM public.club_champs_registrations WHERE id = p_registration_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registration not found'; END IF;

  SELECT * INTO v_member FROM public.club_members WHERE id = v_reg.club_member_id;
  IF v_member.user_id IS NULL OR v_member.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not authorised for this registration';
  END IF;

  SELECT * INTO v_champ FROM public.club_champs WHERE id = v_reg.champ_id;

  IF NOT p_accept THEN
    UPDATE public.club_champs_registrations
       SET status = 'cancelled', confirmed_at = NULL, confirmed_by = NULL, confirmation_source = NULL
     WHERE id = p_registration_id;
    RETURN jsonb_build_object('status', 'cancelled');
  END IF;

  IF p_divisions IS NOT NULL AND array_length(p_divisions, 1) > 0 THEN
    SELECT array_agg((d ->> 'group_number')::int)
      INTO v_allowed
      FROM jsonb_array_elements(public.tournament_division_options(v_reg.champ_id, v_reg.club_member_id)) d;
    SELECT array_agg(DISTINCT x) INTO v_choices
      FROM unnest(p_divisions) x WHERE x = ANY (COALESCE(v_allowed, '{}'));
    IF COALESCE(array_length(v_choices, 1), 0) = 0 THEN
      RAISE EXCEPTION 'Please choose at least one division you are eligible for';
    END IF;
    UPDATE public.club_champs_registrations SET division_choices = v_choices WHERE id = p_registration_id;
  END IF;

  v_amount := COALESCE(v_champ.entry_fee_cents, 0)::numeric / 100;

  IF COALESCE(v_champ.payment_required, false) AND v_amount > 0 THEN
    v_label := COALESCE(v_champ.name, 'Tournament') || ' entry fee';
    INSERT INTO public.club_member_fee_payments (club_member_id, fee_type, fee_label, amount, paid, season_year)
    VALUES (v_reg.club_member_id, 'tournament_entry', v_label, v_amount, false,
            EXTRACT(YEAR FROM COALESCE(v_champ.start_date, now()))::int)
    ON CONFLICT (club_member_id, fee_type, fee_label, season_year)
    DO UPDATE SET amount = EXCLUDED.amount, paid = false, paid_at = NULL
    RETURNING id INTO v_fee_id;
    v_next_status := CASE WHEN v_reg.status = 'pending_eft' THEN 'pending_eft' ELSE 'pending_payment' END;
  ELSE
    v_next_status := 'paid';
  END IF;

  UPDATE public.club_champs_registrations
     SET status = v_next_status,
         fee_payment_id = COALESCE(v_fee_id, fee_payment_id),
         confirmed_at = COALESCE(confirmed_at, now()),
         confirmed_by = COALESCE(confirmed_by, auth.uid()),
         confirmation_source = COALESCE(confirmation_source, 'rsvp')
   WHERE id = p_registration_id;

  PERFORM public.apply_registration_division_choices(p_registration_id);

  RETURN jsonb_build_object('status', v_next_status, 'fee_payment_id', v_fee_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.accept_tournament_invite(uuid, boolean, integer[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_tournament_invite(uuid, boolean, integer[]) TO authenticated, service_role;