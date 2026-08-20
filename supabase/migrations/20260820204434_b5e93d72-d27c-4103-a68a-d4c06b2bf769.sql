-- Lightweight, token-bound recipient verification for public invite responses.
CREATE OR REPLACE FUNCTION public.invite_verification_kind(p_member_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN length(regexp_replace(COALESCE(m.phone, ''), '\D', '', 'g')) >= 4 THEN 'phone_last4'
    WHEN position(' ' IN trim(COALESCE(m.name, ''))) > 0 THEN 'surname'
    ELSE 'none'
  END
  FROM public.club_members m
  WHERE m.id = p_member_id;
$$;

CREATE OR REPLACE FUNCTION public.invite_verification_ok(p_member_id uuid, p_verify text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_member record;
  v_kind text;
  v_digits text;
  v_input text;
BEGIN
  SELECT id, name, phone INTO v_member FROM public.club_members WHERE id = p_member_id;
  IF NOT FOUND THEN RETURN false; END IF;

  v_kind := public.invite_verification_kind(p_member_id);
  IF v_kind = 'none' THEN RETURN true; END IF;

  v_input := trim(COALESCE(p_verify, ''));
  IF v_input = '' THEN RETURN false; END IF;

  IF v_kind = 'phone_last4' THEN
    v_digits := regexp_replace(COALESCE(v_member.phone, ''), '\D', '', 'g');
    RETURN right(v_digits, 4) = right(regexp_replace(v_input, '\D', '', 'g'), 4)
           AND length(regexp_replace(v_input, '\D', '', 'g')) >= 4;
  END IF;

  -- surname: last whitespace-separated word of the stored name
  RETURN lower(v_input) = lower(regexp_replace(trim(v_member.name), '^.*\s', ''));
END;
$$;

-- Public (no login required) invitation response.
CREATE OR REPLACE FUNCTION public.respond_tournament_invite_public(
  p_token text,
  p_accept boolean,
  p_verify text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_reg record;
  v_champ record;
  v_member record;
  v_fee_id uuid;
  v_amount numeric;
  v_next_status text;
  v_label text;
  v_status text;
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 THEN
    RAISE EXCEPTION 'This invitation link is not valid';
  END IF;

  SELECT * INTO v_reg FROM public.club_champs_registrations WHERE invite_token = p_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This invitation link is not valid';
  END IF;
  IF v_reg.invite_revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'This invitation has been withdrawn';
  END IF;

  SELECT id, name, phone, user_id INTO v_member FROM public.club_members WHERE id = v_reg.club_member_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This invitation link is not valid';
  END IF;

  -- A forwarded link must not let anyone else respond: either the caller is the
  -- signed-in invitee, or they must pass the token-bound recipient check.
  IF NOT (auth.uid() IS NOT NULL AND v_member.user_id IS NOT NULL AND auth.uid() = v_member.user_id) THEN
    IF NOT public.invite_verification_ok(v_reg.club_member_id, p_verify) THEN
      RAISE EXCEPTION 'We could not verify that this invitation is yours. Please check the detail you entered.';
    END IF;
  END IF;

  SELECT * INTO v_champ FROM public.club_champs WHERE id = v_reg.champ_id;
  v_status := lower(COALESCE(v_reg.status, ''));

  -- Idempotency: a second click must never duplicate anything.
  IF p_accept AND v_reg.confirmed_at IS NOT NULL
     AND v_status IN ('paid','waived','registered','active','pending_payment','pending_eft') THEN
    RETURN jsonb_build_object(
      'status', v_reg.status,
      'champ_id', v_reg.champ_id,
      'registration_id', v_reg.id,
      'already', true
    );
  END IF;
  IF NOT p_accept AND v_status = 'cancelled' THEN
    RETURN jsonb_build_object(
      'status', 'cancelled', 'champ_id', v_reg.champ_id, 'registration_id', v_reg.id, 'already', true
    );
  END IF;

  IF p_accept
     AND v_champ.registration_closes_at IS NOT NULL
     AND now() > v_champ.registration_closes_at THEN
    RAISE EXCEPTION 'Entries for this tournament have closed';
  END IF;

  IF NOT p_accept THEN
    UPDATE public.club_champs_registrations
       SET status = 'cancelled',
           confirmed_at = NULL,
           confirmed_by = NULL,
           confirmation_source = NULL,
           declined_at = COALESCE(declined_at, now()),
           invite_viewed_at = COALESCE(invite_viewed_at, now())
     WHERE id = v_reg.id;
    RETURN jsonb_build_object(
      'status', 'cancelled', 'champ_id', v_reg.champ_id, 'registration_id', v_reg.id
    );
  END IF;

  v_amount := COALESCE(v_champ.entry_fee_cents, 0)::numeric / 100;

  IF COALESCE(v_champ.payment_required, false) AND v_amount > 0 THEN
    v_label := COALESCE(v_champ.name, 'Tournament') || ' entry fee';
    INSERT INTO public.club_member_fee_payments (
      club_member_id, fee_type, fee_label, amount, paid, season_year
    ) VALUES (
      v_reg.club_member_id, 'tournament_entry', v_label, v_amount, false,
      EXTRACT(YEAR FROM COALESCE(v_champ.start_date, now()))::int
    )
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

  RETURN jsonb_build_object(
    'status', v_next_status,
    'fee_payment_id', v_fee_id,
    'champ_id', v_reg.champ_id,
    'registration_id', v_reg.id
  );
END;
$$;

-- Expose the verification requirement (never the answer) on the public payload.
CREATE OR REPLACE FUNCTION public.get_tournament_invite(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT * INTO v_reg FROM public.club_champs_registrations WHERE invite_token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT * INTO v_champ FROM public.club_champs WHERE id = v_reg.champ_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT id, name, subdomain INTO v_club FROM public.clubs WHERE id = v_champ.club_id;
  SELECT id, name, user_id INTO v_member FROM public.club_members WHERE id = v_reg.club_member_id;

  SELECT e.group_number INTO v_group
    FROM public.club_champs_entries e
   WHERE e.champ_id = v_reg.champ_id AND e.club_member_id = v_reg.club_member_id
   LIMIT 1;

  IF v_group IS NOT NULL THEN
    v_label := COALESCE(NULLIF((v_champ.group_labels)[v_group], ''), 'Division ' || v_group::text);
  END IF;

  v_name := NULLIF(trim(COALESCE(v_member.name, '')), '');
  IF v_name IS NOT NULL AND position(' ' IN v_name) > 0 THEN
    v_name := split_part(v_name, ' ', 1) || ' ' || upper(left(split_part(v_name, ' ', 2), 1)) || '.';
  END IF;

  IF v_champ.registration_closes_at IS NOT NULL AND now() > v_champ.registration_closes_at THEN
    v_closed := true;
  END IF;

  IF v_reg.invite_viewed_at IS NULL THEN
    UPDATE public.club_champs_registrations
       SET invite_viewed_at = now()
     WHERE id = v_reg.id;
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
$$;

-- Organiser-only, read-only preview payload for clearly-marked TEST invitations.
CREATE OR REPLACE FUNCTION public.get_tournament_invite_preview(p_champ_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_champ record;
  v_club record;
BEGIN
  IF auth.uid() IS NULL OR NOT public.can_manage_tournament(auth.uid(), p_champ_id) THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT * INTO v_champ FROM public.club_champs WHERE id = p_champ_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  SELECT id, name, subdomain INTO v_club FROM public.clubs WHERE id = v_champ.club_id;

  RETURN jsonb_build_object(
    'found', true,
    'test', true,
    'champ_id', v_champ.id,
    'tournament_name', v_champ.name,
    'description', v_champ.description,
    'start_date', v_champ.start_date,
    'end_date', v_champ.end_date,
    'registration_closes_at', v_champ.registration_closes_at,
    'entry_fee_cents', COALESCE(v_champ.entry_fee_cents, 0),
    'payment_required', COALESCE(v_champ.payment_required, false),
    'club_name', v_club.name,
    'club_subdomain', v_club.subdomain,
    'invitee_name', 'Test recipient',
    'status', 'invited',
    'verification_kind', 'none',
    'can_respond_public', true,
    'is_invitee', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.invite_verification_kind(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.invite_verification_ok(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.respond_tournament_invite_public(text, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_tournament_invite_preview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.respond_tournament_invite_public(text, boolean, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_tournament_invite_preview(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_tournament_invite(text) TO anon, authenticated, service_role;