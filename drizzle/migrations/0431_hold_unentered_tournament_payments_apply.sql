CREATE OR REPLACE FUNCTION public.champ_registration_payable(p_registration_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE r record; v_groups int; v_types jsonb;
BEGIN
  SELECT * INTO r FROM public.club_champs_registrations WHERE id = p_registration_id;
  IF NOT FOUND THEN RETURN 'This tournament entry could not be found'; END IF;
  IF lower(coalesce(r.status,'')) IN ('cancelled','declined','withdrawn') THEN
    RETURN 'This entry is no longer active, so no payment is needed';
  END IF;
  IF coalesce(cardinality(r.division_choices), 0) > 0 THEN RETURN NULL; END IF;
  SELECT GREATEST(coalesce(t.num_groups, 1), 1), t.beta_lifecycle->'category_types'
    INTO v_groups, v_types FROM public.tournaments t WHERE t.id = r.champ_id;
  IF coalesce(v_groups, 1) > 1 OR (v_types IS NOT NULL AND v_types <> 'null'::jsonb) THEN
    RETURN 'Please choose your category on your invitation before paying the entry fee';
  END IF;
  RETURN NULL;
END $function$;

REVOKE ALL ON FUNCTION public.champ_registration_payable(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.champ_registration_payable(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.champ_hold_unentered_payment(p_registration_id uuid, p_amount numeric, p_ref text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE r record; ch record; v_key text; v_id uuid; v_bill uuid; v_label text; v_season int; v_player text; f record;
BEGIN
  IF p_registration_id IS NULL OR coalesce(p_amount, 0) <= 0 THEN RETURN NULL; END IF;
  SELECT * INTO r FROM public.club_champs_registrations WHERE id = p_registration_id FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_key := 'held:' || p_registration_id::text || ':' || coalesce(p_ref, '');
  SELECT id INTO v_id FROM public.club_member_fee_payments WHERE champ_charge_key = v_key;
  IF FOUND THEN RETURN v_id; END IF;
  SELECT * INTO ch FROM public.club_champs WHERE id = r.champ_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  v_bill := coalesce(public.resolve_host_billing_member(r.club_member_id, ch.club_id), r.club_member_id);
  v_season := EXTRACT(YEAR FROM coalesce(ch.start_date, now()))::int;
  v_label := coalesce(ch.name, 'Tournament') || ' entry fee';

  IF r.fee_payment_id IS NOT NULL THEN
    SELECT * INTO f FROM public.club_member_fee_payments WHERE id = r.fee_payment_id;
    IF FOUND AND NOT f.paid THEN v_id := f.id; END IF;
  END IF;
  IF v_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.club_member_fee_payments
                WHERE club_member_id = v_bill AND fee_type = 'tournament_entry' AND fee_label = v_label AND season_year = v_season) THEN
      v_label := v_label || ' (card payment ' || coalesce(p_ref, '') || ')';
    END IF;
    INSERT INTO public.club_member_fee_payments
      (club_member_id, fee_type, fee_label, amount, paid, season_year, champ_registration_id, champ_charge_key)
    VALUES (v_bill, 'tournament_entry', v_label, p_amount, false, v_season, r.id, v_key)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.club_member_fee_payments
       SET champ_charge_key = coalesce(champ_charge_key, v_key), champ_registration_id = coalesce(champ_registration_id, r.id)
     WHERE id = v_id;
  END IF;
  UPDATE public.club_member_fee_payments SET paid = true, paid_at = now() WHERE id = v_id;

  UPDATE public.club_champs_registrations
     SET fee_payment_id = v_id,
         fee_paid_cents = round(p_amount * 100)::int,
         payment_ref = coalesce(payment_ref, p_ref),
         paid_at = coalesce(paid_at, now())
   WHERE id = r.id;

  SELECT name INTO v_player FROM public.club_members WHERE id = r.club_member_id;
  INSERT INTO public.audit_events (club_id, actor_user_id, entity_type, entity_id, action, reason, after_data)
  VALUES (ch.club_id, auth.uid(), 'club_champs_registration', r.id, 'unentered_payment_held',
          'Card payment arrived before a category was chosen; recorded as a paid entry fee on the invitation',
          jsonb_build_object('fee_payment_id', v_id, 'amount', p_amount, 'payment_ref', p_ref));

  INSERT INTO public.notifications (user_id, club_member_id, title, message, type, url, data)
  SELECT a.user_id, a.id,
         'Entry fee paid — category still to choose',
         coalesce(v_player, 'A player') || ' paid R' || to_char(p_amount, 'FM999990.00') || ' for '
           || coalesce(ch.name, 'a tournament') || ' but has not chosen a category yet. The payment is recorded; they need to open their invitation and choose a category.',
         'tournament_payment_unentered',
         '/club-admin?tab=tournaments',
         jsonb_build_object('champ_id', r.champ_id, 'registration_id', r.id)
  FROM public.club_members a
  WHERE a.club_id = ch.club_id AND a.role = 'admin' AND a.user_id IS NOT NULL;

  RETURN v_id;
END $function$;

REVOKE ALL ON FUNCTION public.champ_hold_unentered_payment(uuid, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.champ_hold_unentered_payment(uuid, numeric, text) TO service_role;

CREATE OR REPLACE FUNCTION public.respond_tournament_invite_public(p_token text, p_accept boolean, p_verify text DEFAULT NULL::text, p_divisions integer[] DEFAULT NULL::integer[])
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

  -- A card payment that arrived before a category was chosen is already recorded
  -- as a paid fee on this entry (champ_hold_unentered_payment): accepting completes
  -- the entry without raising a second charge.
  IF COALESCE(v_reg.fee_paid_cents, 0) > 0 AND v_reg.fee_payment_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.club_member_fee_payments f WHERE f.id = v_reg.fee_payment_id AND f.paid) THEN
    v_fee_id := v_reg.fee_payment_id;
    v_next_status := 'paid';
  ELSIF COALESCE(v_champ.payment_required, false) AND v_amount > 0 THEN
    v_label := COALESCE(v_champ.name, 'Tournament') || ' entry fee';
    INSERT INTO public.club_member_fee_payments (club_member_id, fee_type, fee_label, amount, paid, season_year)
    VALUES (coalesce(public.resolve_host_billing_member(v_reg.club_member_id, v_champ.club_id), v_reg.club_member_id), 'tournament_entry', v_label, v_amount, false,
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
$function$;