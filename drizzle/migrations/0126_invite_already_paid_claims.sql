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