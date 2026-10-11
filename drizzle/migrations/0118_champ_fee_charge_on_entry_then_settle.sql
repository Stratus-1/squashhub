CREATE OR REPLACE FUNCTION public.champ_payment_claim_submit(p_champ uuid, p_method text, p_paid_on date, p_reference text, p_amount_cents integer, p_proof_path text, p_allocations jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_club uuid; v_id uuid; a jsonb; v_sum int := 0; v_admin boolean; v_reg uuid;
BEGIN
  SELECT club_id INTO v_club FROM public.tournaments WHERE id = p_champ;
  IF v_club IS NULL THEN RAISE EXCEPTION 'unknown tournament'; END IF;
  v_admin := public.is_club_admin(auth.uid(), v_club);
  IF jsonb_typeof(p_allocations) <> 'array' OR jsonb_array_length(p_allocations) = 0 THEN RAISE EXCEPTION 'Choose at least one member'; END IF;
  FOR a IN SELECT * FROM jsonb_array_elements(p_allocations) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.club_champs_registrations r WHERE r.champ_id = p_champ AND r.club_member_id = (a->>'club_member_id')::uuid) THEN
      RAISE EXCEPTION 'Member is not entered in this tournament'; END IF;
    IF NOT v_admin AND NOT public.champ_user_can_act_for_member((a->>'club_member_id')::uuid, auth.uid()) THEN
      RAISE EXCEPTION 'You cannot report payment for this member'; END IF;
    v_sum := v_sum + (a->>'amount_cents')::int;
  END LOOP;
  IF v_sum <> p_amount_cents THEN RAISE EXCEPTION 'Split must add up to the amount paid'; END IF;
  -- Step 1: fee charged to each member account now (idempotent; never a second charge).
  FOR v_reg IN SELECT r.id FROM public.club_champs_registrations r
     WHERE r.champ_id = p_champ AND r.club_member_id IN (SELECT (x->>'club_member_id')::uuid FROM jsonb_array_elements(p_allocations) x)
       AND lower(coalesce(r.status,'')) NOT IN ('cancelled','declined','withdrawn','waived')
       AND lower(coalesce(r.fee_status,'')) NOT IN ('paid','waived') LOOP
    PERFORM public.ensure_tournament_entry_fee(v_reg);
  END LOOP;
  INSERT INTO public.champ_payment_claims (club_id, champ_id, claimant_user_id, recorded_by_admin, method, paid_on, reference, amount_cents, proof_path)
  VALUES (v_club, p_champ, auth.uid(), v_admin AND coalesce((p_allocations->0->>'admin')::boolean,false), p_method, p_paid_on, nullif(trim(p_reference),''), p_amount_cents, p_proof_path)
  RETURNING id INTO v_id;
  INSERT INTO public.champ_payment_claim_allocations (claim_id, club_member_id, registration_id, amount_cents, created_by)
  SELECT v_id, (x->>'club_member_id')::uuid,
         (SELECT r.id FROM public.club_champs_registrations r WHERE r.champ_id = p_champ AND r.club_member_id = (x->>'club_member_id')::uuid LIMIT 1),
         (x->>'amount_cents')::int, auth.uid()
    FROM jsonb_array_elements(p_allocations) x;
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.champ_member_open_fee_ids(p_champ uuid, p_member uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT f.id FROM public.club_member_fee_payments f
   WHERE NOT f.paid AND (
     f.champ_charge_key LIKE 'champ:'||p_champ||':'||p_member||':%'
     OR f.id IN (SELECT r.fee_payment_id FROM public.club_champs_registrations r
                  WHERE r.champ_id = p_champ AND r.club_member_id = p_member AND r.fee_payment_id IS NOT NULL))
$$;
REVOKE ALL ON FUNCTION public.champ_member_open_fee_ids(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.champ_payment_claim_review(p_claim uuid, p_action text, p_reason text, p_allocations jsonb DEFAULT NULL::jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c record; al record; v_due int; v_sum int; v_uid uuid;
BEGIN
  SELECT * INTO c FROM public.champ_payment_claims WHERE id = p_claim FOR UPDATE;
  IF c.id IS NULL THEN RAISE EXCEPTION 'unknown claim'; END IF;
  IF NOT public.is_club_admin(auth.uid(), c.club_id) THEN RAISE EXCEPTION 'not authorised'; END IF;
  IF c.status IN ('approved','rejected') THEN RAISE EXCEPTION 'Claim already %', c.status; END IF;
  IF p_action IN ('reject','needs_proof') THEN
    IF coalesce(trim(p_reason),'') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
    UPDATE public.champ_payment_claims SET status = CASE p_action WHEN 'reject' THEN 'rejected' ELSE 'needs_proof' END,
      review_reason = p_reason, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now() WHERE id = p_claim;
    INSERT INTO public.audit_events (club_id, actor_user_id, action, entity_type, entity_id, reason)
    VALUES (c.club_id, auth.uid(), 'champ_claim_'||p_action, 'champ_payment_claim', p_claim, p_reason);
    RETURN;
  END IF;
  IF p_action <> 'approve' THEN RAISE EXCEPTION 'bad action'; END IF;
  IF p_allocations IS NOT NULL THEN
    SELECT coalesce(sum((x->>'amount_cents')::int),0) INTO v_sum FROM jsonb_array_elements(p_allocations) x;
    IF v_sum <> c.amount_cents THEN RAISE EXCEPTION 'Split must add up to the amount paid'; END IF;
    DELETE FROM public.champ_payment_claim_allocations WHERE claim_id = p_claim;
    INSERT INTO public.champ_payment_claim_allocations (claim_id, club_member_id, registration_id, amount_cents, created_by)
    SELECT p_claim, (x->>'club_member_id')::uuid,
           (SELECT r.id FROM public.club_champs_registrations r WHERE r.champ_id = c.champ_id AND r.club_member_id = (x->>'club_member_id')::uuid LIMIT 1),
           (x->>'amount_cents')::int, auth.uid()
      FROM jsonb_array_elements(p_allocations) x WHERE (x->>'amount_cents')::int > 0;
  END IF;
  FOR al IN SELECT * FROM public.champ_payment_claim_allocations WHERE claim_id = p_claim LOOP
    IF al.registration_id IS NOT NULL THEN PERFORM public.ensure_tournament_entry_fee(al.registration_id); END IF;
    PERFORM 1 FROM public.club_member_fee_payments f WHERE f.id IN (SELECT public.champ_member_open_fee_ids(c.champ_id, al.club_member_id)) FOR UPDATE;
    SELECT coalesce(sum(round(f.amount*100)),0)::int INTO v_due FROM public.club_member_fee_payments f
     WHERE f.id IN (SELECT public.champ_member_open_fee_ids(c.champ_id, al.club_member_id));
    IF v_due = 0 THEN RAISE EXCEPTION 'No unpaid tournament fee for a member — it may already be paid'; END IF;
    IF al.amount_cents < v_due THEN RAISE EXCEPTION 'Allocated amount (%) is less than the member''s unpaid charge (%); part-payments are not supported', al.amount_cents, v_due; END IF;
    UPDATE public.club_member_fee_payments f SET paid = true, paid_at = coalesce(c.paid_on::timestamptz, now())
     WHERE f.id IN (SELECT public.champ_member_open_fee_ids(c.champ_id, al.club_member_id));
    IF al.amount_cents > v_due THEN
      SELECT user_id INTO v_uid FROM public.club_members WHERE id = al.club_member_id;
      INSERT INTO public.member_credit_transactions (user_id, club_id, club_member_id, amount, type, method, status, description, reference, confirmed_at, confirmed_by)
      VALUES (v_uid, c.club_id, al.club_member_id, (al.amount_cents - v_due) / 100.0, 'topup', c.method, 'confirmed',
              'Excess on verified tournament payment', 'champclaim:'||p_claim||':'||al.club_member_id, now(), auth.uid());
    END IF;
    UPDATE public.club_champs_registrations SET payment_ref = coalesce(c.reference, payment_ref), proof_url = coalesce(c.proof_path, proof_url) WHERE id = al.registration_id;
    UPDATE public.champ_payment_claim_allocations SET credit_cents = greatest(0, al.amount_cents - v_due),
      fee_payment_id = (SELECT fee_payment_id FROM public.club_champs_registrations WHERE id = al.registration_id) WHERE id = al.id;
  END LOOP;
  UPDATE public.champ_payment_claims SET status = 'approved', review_reason = p_reason, reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now() WHERE id = p_claim;
  INSERT INTO public.audit_events (club_id, actor_user_id, action, entity_type, entity_id, reason, after_data)
  VALUES (c.club_id, auth.uid(), 'champ_claim_approve', 'champ_payment_claim', p_claim, p_reason,
          (SELECT jsonb_agg(jsonb_build_object('member', club_member_id, 'cents', amount_cents, 'credit', credit_cents)) FROM public.champ_payment_claim_allocations WHERE claim_id = p_claim));
END $$;

COMMENT ON FUNCTION public.champ_fee_post_charges(uuid, bigint) IS 'DEPRECATED: bulk Post charges removed from UI; fees are charged per entry via ensure_tournament_entry_fee.';