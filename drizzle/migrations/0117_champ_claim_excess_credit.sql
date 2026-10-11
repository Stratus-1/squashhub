
ALTER TABLE public.champ_payment_claim_allocations ADD COLUMN IF NOT EXISTS credit_cents integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.champ_payment_claim_review(p_claim uuid, p_action text, p_reason text, p_allocations jsonb DEFAULT NULL)
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
  IF (SELECT entry_fee_basis FROM public.tournaments WHERE id = c.champ_id) IS NULL THEN RAISE EXCEPTION 'Fee basis needs confirmation'; END IF;
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
    PERFORM 1 FROM public.club_member_fee_payments f
     WHERE f.champ_charge_key LIKE 'champ:'||c.champ_id||':'||al.club_member_id||':%' FOR UPDATE;
    SELECT coalesce(sum(round(f.amount*100)),0)::int INTO v_due FROM public.club_member_fee_payments f
     WHERE f.champ_charge_key LIKE 'champ:'||c.champ_id||':'||al.club_member_id||':%' AND NOT f.paid;
    IF v_due = 0 THEN RAISE EXCEPTION 'No unpaid charge for a member — post charges first, or it is already paid'; END IF;
    IF al.amount_cents < v_due THEN RAISE EXCEPTION 'Allocated amount (%) is less than the member''s unpaid charge (%); part-payments are not supported', al.amount_cents, v_due; END IF;
    UPDATE public.club_member_fee_payments f SET paid = true, paid_at = coalesce(c.paid_on::timestamptz, now())
     WHERE f.champ_charge_key LIKE 'champ:'||c.champ_id||':'||al.club_member_id||':%' AND NOT f.paid;
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

-- Proof uploads: members upload under champ-claims/<uid>/..., admins read via existing bucket policies.
