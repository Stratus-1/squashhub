-- 1. Picking a partner books the pair immediately; the chooser pays for both.
CREATE OR REPLACE FUNCTION public.propose_doubles_partner(p_champ_id uuid, p_group_number integer, p_partner_member_id uuid, p_token text DEFAULT NULL::text, p_verify text DEFAULT NULL::text, p_pay_for_partner boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_me uuid; v_existing record; v_id uuid; v_status text;
BEGIN
  v_me := public.champ_actor_member(p_champ_id, p_token, p_verify);
  IF v_me = p_partner_member_id THEN RAISE EXCEPTION 'You cannot pair with yourself'; END IF;
  IF public.champ_pairing_locked(p_champ_id) THEN
    RAISE EXCEPTION 'Doubles pairs are locked by the organiser';
  END IF;
  IF NOT public.champ_division_is_doubles(p_champ_id, p_group_number) THEN
    RAISE EXCEPTION 'This division is not a doubles division';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_champ_id::text || ':' || p_group_number::text, 0));

  IF NOT public.champ_member_accepted(p_champ_id, v_me, p_group_number) THEN
    RAISE EXCEPTION 'Please complete your own registration for this division first';
  END IF;
  IF NOT public.champ_member_invited(p_champ_id, p_partner_member_id, p_group_number) THEN
    RAISE EXCEPTION 'You can only pick a partner from the invited players for this division.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.champ_doubles_pairs p
     WHERE p.champ_id = p_champ_id AND p.group_number = p_group_number
       AND p.status IN ('awaiting_payment','confirmed')
       AND (p.member_a IN (v_me, p_partner_member_id) OR p.member_b IN (v_me, p_partner_member_id))
  ) THEN
    RAISE EXCEPTION 'One of these players is already paired in this division';
  END IF;

  -- Any existing proposal between these two players is simply accepted.
  SELECT * INTO v_existing FROM public.champ_doubles_pairs p
   WHERE p.champ_id = p_champ_id AND p.group_number = p_group_number AND p.status = 'pending'
     AND ((p.member_a = p_partner_member_id AND p.member_b = v_me)
       OR (p.member_a = v_me AND p.member_b = p_partner_member_id))
   LIMIT 1;

  IF FOUND THEN
    UPDATE public.champ_doubles_pairs
       SET responded_at = now(), responded_by = v_me, accepted_at = COALESCE(accepted_at, now()),
           status = 'awaiting_payment',
           pays_for_partner = true,
           payer_member_id = COALESCE(payer_member_id, v_me)
     WHERE id = v_existing.id;
    v_status := public.champ_pair_settle(v_existing.id);
    RETURN jsonb_build_object('id', v_existing.id, 'status', v_status);
  END IF;

  UPDATE public.champ_doubles_pairs
     SET status = 'cancelled', responded_at = now(), responded_by = v_me
   WHERE champ_id = p_champ_id AND group_number = p_group_number AND status = 'pending'
     AND proposed_by = v_me;

  -- No partner approval is required: the pair is booked on selection and only
  -- waits for the entry fee, which the chooser pays for both players.
  INSERT INTO public.champ_doubles_pairs (champ_id, group_number, member_a, member_b, proposed_by, status,
                                          accepted_at, responded_at, responded_by,
                                          pays_for_partner, payer_member_id, origin)
  VALUES (p_champ_id, p_group_number, v_me, p_partner_member_id, v_me, 'awaiting_payment',
          now(), now(), v_me, true, v_me, 'player')
  RETURNING id INTO v_id;

  v_status := public.champ_pair_settle(v_id);
  RETURN jsonb_build_object('id', v_id, 'status', v_status);
END $function$;

-- 2. Invitation payment context: the payer of a pair pays both entry fees.
CREATE OR REPLACE FUNCTION public.tournament_invite_payment_context(p_token text, p_verify text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reg record;
  v_champ record;
  v_member record;
  v_amount numeric;
  v_fee numeric;
  v_pair record;
  v_partner uuid;
  v_covered int := 0;
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This invitation link is not valid');
  END IF;

  SELECT * INTO v_reg FROM public.club_champs_registrations WHERE invite_token = p_token;
  IF NOT FOUND OR v_reg.invite_revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This invitation link is not valid');
  END IF;

  SELECT id, club_id, name, email, phone, user_id INTO v_member
    FROM public.club_members WHERE id = v_reg.club_member_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This invitation link is not valid');
  END IF;

  IF NOT (auth.uid() IS NOT NULL AND v_member.user_id IS NOT NULL AND auth.uid() = v_member.user_id) THEN
    IF NOT public.invite_verification_ok(v_reg.club_member_id, p_verify) THEN
      RETURN jsonb_build_object('ok', false, 'needs_verification', true,
        'error', 'We could not verify that this invitation is yours. Please check the detail you entered.');
    END IF;
  END IF;

  SELECT * INTO v_champ FROM public.club_champs WHERE id = v_reg.champ_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This invitation link is not valid');
  END IF;

  IF lower(COALESCE(v_reg.status, '')) IN ('paid','waived','cancelled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'There is nothing outstanding on this entry');
  END IF;

  v_fee := COALESCE(v_champ.entry_fee_cents, 0)::numeric / 100;
  IF NOT COALESCE(v_champ.payment_required, false) OR v_fee <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'This tournament has no entry fee to pay');
  END IF;
  v_amount := v_fee;

  -- Doubles: when this member is the payer for the pair, cover the partner too.
  SELECT * INTO v_pair FROM public.champ_doubles_pairs p
   WHERE p.champ_id = v_reg.champ_id
     AND p.status IN ('pending','awaiting_payment')
     AND COALESCE(p.pays_for_partner, false)
     AND COALESCE(p.payer_member_id, p.proposed_by) = v_reg.club_member_id
     AND (p.member_a = v_reg.club_member_id OR p.member_b = v_reg.club_member_id)
   ORDER BY p.created_at DESC LIMIT 1;

  IF FOUND THEN
    v_partner := CASE WHEN v_pair.member_a = v_reg.club_member_id THEN v_pair.member_b ELSE v_pair.member_a END;
    IF NOT public.champ_member_fee_paid(v_reg.champ_id, v_partner) THEN
      v_amount := v_amount + v_fee;
      v_covered := 1;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'club_id', v_member.club_id,
    'club_member_id', v_member.id,
    'registration_id', v_reg.id,
    'champ_id', v_reg.champ_id,
    'user_id', v_member.user_id,
    'amount', v_amount,
    'covered_partners', v_covered,
    'fee_payment_id', v_reg.fee_payment_id,
    'description', COALESCE(v_champ.name, 'Tournament')
      || CASE WHEN v_covered > 0 THEN ' entry fees (pair)' ELSE ' entry fee' END
  );
END;
$function$;

-- 3. After a tournament entry is paid, settle the pair and the covered partner.
CREATE OR REPLACE FUNCTION public.champ_apply_paid_registration(p_registration_id uuid, p_payment_ref text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reg record;
  v_fee int;
  v_pair record;
  v_partner uuid;
  v_partner_reg record;
  v_covered int := 0;
BEGIN
  SELECT * INTO v_reg FROM public.club_champs_registrations WHERE id = p_registration_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false); END IF;

  v_fee := COALESCE(public.champ_entry_fee_cents(v_reg.champ_id), 0);

  FOR v_pair IN
    SELECT * FROM public.champ_doubles_pairs p
     WHERE p.champ_id = v_reg.champ_id
       AND p.status IN ('pending','awaiting_payment')
       AND (p.member_a = v_reg.club_member_id OR p.member_b = v_reg.club_member_id)
  LOOP
    IF COALESCE(v_pair.pays_for_partner, false)
       AND COALESCE(v_pair.payer_member_id, v_pair.proposed_by) = v_reg.club_member_id THEN
      v_partner := CASE WHEN v_pair.member_a = v_reg.club_member_id THEN v_pair.member_b ELSE v_pair.member_a END;

      SELECT * INTO v_partner_reg FROM public.club_champs_registrations
       WHERE champ_id = v_reg.champ_id AND club_member_id = v_partner LIMIT 1;

      IF FOUND AND NOT public.champ_member_fee_paid(v_reg.champ_id, v_partner) THEN
        UPDATE public.club_champs_registrations
           SET status = 'paid',
               fee_paid_cents = GREATEST(COALESCE(fee_paid_cents, 0), v_fee),
               paid_at = COALESCE(paid_at, now()),
               payment_ref = COALESCE(payment_ref, p_payment_ref),
               paid_by_member_id = v_reg.club_member_id,
               confirmed_at = COALESCE(confirmed_at, now())
         WHERE id = v_partner_reg.id;

        IF v_partner_reg.fee_payment_id IS NOT NULL THEN
          UPDATE public.club_member_fee_payments
             SET paid = true, paid_at = COALESCE(paid_at, now())
           WHERE id = v_partner_reg.fee_payment_id;
        END IF;
        v_covered := v_covered + 1;
      END IF;
    END IF;

    PERFORM public.champ_pair_settle(v_pair.id);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'covered_partners', v_covered);
END $function$;

GRANT EXECUTE ON FUNCTION public.champ_apply_paid_registration(uuid, text) TO service_role;