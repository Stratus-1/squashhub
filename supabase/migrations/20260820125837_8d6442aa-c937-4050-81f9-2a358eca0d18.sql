CREATE OR REPLACE FUNCTION public.accept_tournament_invite(p_registration_id uuid, p_accept boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reg record;
  v_champ record;
  v_member record;
  v_fee_id uuid;
  v_amount numeric;
  v_next_status text;
  v_label text;
BEGIN
  SELECT * INTO v_reg FROM public.club_champs_registrations WHERE id = p_registration_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Registration not found';
  END IF;

  SELECT * INTO v_member FROM public.club_members WHERE id = v_reg.club_member_id;
  IF v_member.user_id IS NULL OR v_member.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not authorised for this registration';
  END IF;

  SELECT * INTO v_champ FROM public.club_champs WHERE id = v_reg.champ_id;

  IF NOT p_accept THEN
    UPDATE public.club_champs_registrations
       SET status = 'cancelled',
           confirmed_at = NULL,
           confirmed_by = NULL,
           confirmation_source = NULL
     WHERE id = p_registration_id;
    RETURN jsonb_build_object('status', 'cancelled');
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
    DO UPDATE SET amount = EXCLUDED.amount, paid = false, paid_at = NULL
    RETURNING id INTO v_fee_id;

    -- Accepted, fee outstanding. Keep the payment method open (card or EFT):
    -- the player chooses on the tournament page.
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

  RETURN jsonb_build_object('status', v_next_status, 'fee_payment_id', v_fee_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.respond_tournament_invite(p_token text, p_accept boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reg record;
  v_champ record;
  v_member record;
  v_conflict uuid;
  v_claimed boolean := false;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in to respond to this invitation';
  END IF;

  SELECT * INTO v_reg FROM public.club_champs_registrations WHERE invite_token = p_token;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This invitation link is not valid';
  END IF;

  IF v_reg.invite_revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'This invitation has been withdrawn';
  END IF;

  SELECT id, user_id, club_id INTO v_member FROM public.club_members WHERE id = v_reg.club_member_id;

  -- The invited membership has never been claimed: bind it to the account the
  -- invitee just created (the invite token is the proof of invitation), unless
  -- this account is already a different member of the same club.
  IF v_member.user_id IS NULL THEN
    SELECT id INTO v_conflict
      FROM public.club_members
     WHERE club_id = v_member.club_id
       AND user_id = auth.uid()
       AND id <> v_member.id
     LIMIT 1;
    IF v_conflict IS NOT NULL THEN
      RAISE EXCEPTION 'This account is already linked to a different member of this club';
    END IF;

    UPDATE public.club_members
       SET user_id = auth.uid()
     WHERE id = v_member.id
       AND user_id IS NULL;
    v_member.user_id := auth.uid();
    v_claimed := true;
  ELSIF v_member.user_id <> auth.uid() THEN
    RAISE EXCEPTION 'This invitation belongs to another member';
  END IF;

  SELECT * INTO v_champ FROM public.club_champs WHERE id = v_reg.champ_id;

  IF p_accept
     AND v_champ.registration_closes_at IS NOT NULL
     AND now() > v_champ.registration_closes_at THEN
    RAISE EXCEPTION 'Entries for this tournament have closed';
  END IF;

  v_result := public.accept_tournament_invite(v_reg.id, p_accept);

  UPDATE public.club_champs_registrations
     SET declined_at = CASE WHEN p_accept THEN NULL ELSE COALESCE(declined_at, now()) END,
         invite_viewed_at = COALESCE(invite_viewed_at, now())
   WHERE id = v_reg.id;

  RETURN v_result || jsonb_build_object(
    'champ_id', v_reg.champ_id,
    'registration_id', v_reg.id,
    'membership_claimed', v_claimed
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_tournament_invite(p_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reg record;
  v_champ record;
  v_club record;
  v_member record;
  v_group int;
  v_label text;
  v_name text;
  v_closed boolean := false;
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT * INTO v_reg
    FROM public.club_champs_registrations
   WHERE invite_token = p_token;
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
    v_label := COALESCE(
      NULLIF((v_champ.group_labels)[v_group], ''),
      'Division ' || v_group::text
    );
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
    'requires_login', v_member.user_id IS NULL OR auth.uid() IS NULL OR auth.uid() <> v_member.user_id,
    'is_invitee', (auth.uid() IS NOT NULL AND auth.uid() = v_member.user_id)
                  OR (auth.uid() IS NOT NULL AND v_member.user_id IS NULL)
  );
END;
$function$;