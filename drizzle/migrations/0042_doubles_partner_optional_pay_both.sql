CREATE OR REPLACE FUNCTION public.propose_doubles_partner(p_champ_id uuid, p_group_number integer, p_partner_member_id uuid, p_token text DEFAULT NULL::text, p_verify text DEFAULT NULL::text, p_pay_for_partner boolean DEFAULT true)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_me uuid; v_existing record; v_id uuid; v_status text; v_both boolean := COALESCE(p_pay_for_partner, true);
BEGIN
  v_me := public.champ_actor_member(p_champ_id, p_token, p_verify);
  IF v_me = p_partner_member_id THEN RAISE EXCEPTION 'You cannot pair with yourself'; END IF;
  IF public.champ_pairing_locked(p_champ_id) THEN RAISE EXCEPTION 'Doubles pairs are locked by the organiser'; END IF;
  IF NOT public.champ_division_is_doubles(p_champ_id, p_group_number) THEN RAISE EXCEPTION 'This division is not a doubles division'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_champ_id::text || ':' || p_group_number::text, 0));
  IF NOT public.champ_member_accepted(p_champ_id, v_me, p_group_number) THEN
    RAISE EXCEPTION 'Please complete your own registration for this division first';
  END IF;
  IF NOT public.champ_member_invited(p_champ_id, p_partner_member_id, p_group_number) THEN
    RAISE EXCEPTION 'You can only pick a partner from the invited players for this division.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.champ_doubles_pairs p
     WHERE p.champ_id = p_champ_id AND p.group_number = p_group_number
       AND p.status IN ('awaiting_payment','confirmed')
       AND (p.member_a IN (v_me, p_partner_member_id) OR p.member_b IN (v_me, p_partner_member_id))) THEN
    RAISE EXCEPTION 'One of these players is already paired in this division';
  END IF;
  SELECT * INTO v_existing FROM public.champ_doubles_pairs p
   WHERE p.champ_id = p_champ_id AND p.group_number = p_group_number AND p.status = 'pending'
     AND ((p.member_a = p_partner_member_id AND p.member_b = v_me) OR (p.member_a = v_me AND p.member_b = p_partner_member_id))
   LIMIT 1;
  IF FOUND THEN
    UPDATE public.champ_doubles_pairs
       SET responded_at = now(), responded_by = v_me, accepted_at = COALESCE(accepted_at, now()),
           status = 'awaiting_payment',
           pays_for_partner = v_both,
           payer_member_id = CASE WHEN v_both THEN COALESCE(payer_member_id, v_me) ELSE NULL END
     WHERE id = v_existing.id;
    v_status := public.champ_pair_settle(v_existing.id);
    RETURN jsonb_build_object('id', v_existing.id, 'status', v_status);
  END IF;
  UPDATE public.champ_doubles_pairs SET status = 'cancelled', responded_at = now(), responded_by = v_me
   WHERE champ_id = p_champ_id AND group_number = p_group_number AND status = 'pending' AND proposed_by = v_me;
  -- Pair is booked on selection. The chooser either pays both entries or only
  -- their own, in which case the partner is asked to pay theirs.
  INSERT INTO public.champ_doubles_pairs (champ_id, group_number, member_a, member_b, proposed_by, status,
                                          accepted_at, responded_at, responded_by, pays_for_partner, payer_member_id, origin)
  VALUES (p_champ_id, p_group_number, v_me, p_partner_member_id, v_me, 'awaiting_payment',
          now(), now(), v_me, v_both, CASE WHEN v_both THEN v_me ELSE NULL END, 'player')
  RETURNING id INTO v_id;
  v_status := public.champ_pair_settle(v_id);
  RETURN jsonb_build_object('id', v_id, 'status', v_status);
END $function$;