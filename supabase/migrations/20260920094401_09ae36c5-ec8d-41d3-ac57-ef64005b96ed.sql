-- 1) Fee-paid ledger trigger: post only the amount not already credited by
--    part-payments, instead of skipping entirely once any credit exists.
CREATE OR REPLACE FUNCTION public.journal_fee_payment_received()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_club_id uuid;
  v_ref uuid;
  v_amount numeric;
  v_credited numeric;
  v_label text;
BEGIN
  -- Only fire on false -> true paid transition
  IF NEW.paid IS NOT TRUE THEN RETURN NEW; END IF;
  IF OLD.paid IS TRUE THEN RETURN NEW; END IF;

  -- Original assessed amount from the debtors assessment entry.
  SELECT debit INTO v_amount
  FROM public.club_journal_entries
  WHERE fee_payment_id = NEW.id
    AND account = 'debtors'::public.gl_account
    AND debit > 0
  ORDER BY created_at ASC
  LIMIT 1;

  -- Fallback to current amount if no assessment entry was found
  IF v_amount IS NULL OR v_amount <= 0 THEN
    v_amount := COALESCE(NEW.amount, 0);
  END IF;

  -- Subtract instalments already credited against this fee (partial flow).
  SELECT COALESCE(sum(credit), 0) INTO v_credited
  FROM public.club_journal_entries
  WHERE fee_payment_id = NEW.id
    AND account = 'debtors'::public.gl_account
    AND credit > 0;

  v_amount := v_amount - COALESCE(v_credited, 0);
  IF v_amount <= 0 THEN RETURN NEW; END IF;

  SELECT cm.club_id INTO v_club_id
  FROM public.club_members cm
  WHERE cm.id = NEW.club_member_id;
  IF v_club_id IS NULL THEN RETURN NEW; END IF;

  v_ref := gen_random_uuid();
  v_label := 'Fee paid: ' || COALESCE(NEW.fee_label, 'membership');

  -- Dr Bank (money received)  Cr Debtors (member's balance cleared)
  INSERT INTO public.club_journal_entries
    (club_id, club_member_id, fee_payment_id, account, debit, credit, description, journal_ref)
  VALUES
    (v_club_id, NEW.club_member_id, NEW.id, 'bank_current', v_amount, 0, v_label, v_ref),
    (v_club_id, NEW.club_member_id, NEW.id, 'debtors',     0, v_amount, v_label, v_ref);

  RETURN NEW;
END;
$$;

-- 2) Collection settlement: partial instalments reduce the fee and post to the
--    ledger instead of only settling fees covered in full.
CREATE OR REPLACE FUNCTION public.record_collection_payment(_collection_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c public.stitch_collections%ROWTYPE;
  m public.stitch_mandates%ROWTYPE;
  v_when timestamptz;
  v_total numeric;
  v_remaining numeric;
  v_tx_id uuid;
  v_fee record;
  v_ref text;
  v_part_ref uuid;
  v_settled integer := 0;
BEGIN
  SELECT * INTO c FROM public.stitch_collections WHERE id = _collection_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;

  IF c.posted_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  SELECT * INTO m FROM public.stitch_mandates WHERE id = c.mandate_id;

  v_ref := 'stitch-col:' || c.id::text;
  IF EXISTS (
    SELECT 1 FROM public.member_credit_transactions WHERE reference = v_ref
  ) THEN
    UPDATE public.stitch_collections SET posted_at = COALESCE(posted_at, now()) WHERE id = c.id;
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  v_when := COALESCE(c.settled_at, now());
  v_total := COALESCE(c.amount_cents, 0)::numeric / 100.0;
  IF v_total <= 0 THEN
    UPDATE public.stitch_collections SET posted_at = now() WHERE id = c.id;
    RETURN jsonb_build_object('ok', true, 'skipped', 'zero_amount');
  END IF;

  v_remaining := v_total;

  IF c.fee_payable_id IS NOT NULL THEN
    SELECT id, amount INTO v_fee
    FROM public.club_member_fee_payments
    WHERE id = c.fee_payable_id AND paid IS NOT TRUE;
    IF FOUND AND v_fee.amount <= v_remaining THEN
      UPDATE public.club_member_fee_payments SET paid = true, paid_at = v_when WHERE id = v_fee.id;
      UPDATE public.club_journal_entries SET created_at = v_when
        WHERE fee_payment_id = v_fee.id AND credit > 0 AND account = 'debtors';
      UPDATE public.club_journal_entries SET created_at = v_when
        WHERE fee_payment_id = v_fee.id AND debit > 0 AND account = 'bank_current';
      v_remaining := v_remaining - v_fee.amount;
      v_settled := v_settled + 1;
    END IF;
  END IF;

  FOR v_fee IN
    SELECT id, amount, fee_label
    FROM public.club_member_fee_payments
    WHERE club_member_id = c.club_member_id
      AND paid IS NOT TRUE
      AND COALESCE(amount, 0) > 0
    ORDER BY created_at ASC
  LOOP
    EXIT WHEN v_remaining <= 0;
    IF v_fee.amount <= v_remaining THEN
      UPDATE public.club_member_fee_payments SET paid = true, paid_at = v_when WHERE id = v_fee.id;
      UPDATE public.club_journal_entries SET created_at = v_when
        WHERE fee_payment_id = v_fee.id AND credit > 0 AND account = 'debtors';
      UPDATE public.club_journal_entries SET created_at = v_when
        WHERE fee_payment_id = v_fee.id AND debit > 0 AND account = 'bank_current';
      v_remaining := v_remaining - v_fee.amount;
      v_settled := v_settled + 1;
    ELSE
      -- Partial instalment: reduce the outstanding fee and book the payment.
      v_part_ref := gen_random_uuid();
      INSERT INTO public.club_journal_entries
        (club_id, club_member_id, fee_payment_id, account, debit, credit, description, journal_ref, created_at)
      VALUES
        (c.club_id, c.club_member_id, v_fee.id, 'bank_current', v_remaining, 0,
         'Part payment: ' || COALESCE(v_fee.fee_label, 'membership') || ' [Stitch]', v_part_ref, v_when),
        (c.club_id, c.club_member_id, v_fee.id, 'debtors', 0, v_remaining,
         'Part payment: ' || COALESCE(v_fee.fee_label, 'membership') || ' [Stitch]', v_part_ref, v_when);
      UPDATE public.club_member_fee_payments SET amount = amount - v_remaining WHERE id = v_fee.id;
      v_remaining := 0;
      v_settled := v_settled + 1;
    END IF;
  END LOOP;

  IF v_remaining > 0 THEN
    INSERT INTO public.member_credit_transactions
      (user_id, club_id, club_member_id, amount, type, method, status,
       description, reference, created_at, confirmed_at)
    VALUES
      (COALESCE(m.user_id, NULL), c.club_id, c.club_member_id, v_remaining, 'debit', 'card', 'confirmed',
       'Recurring card payment [Stitch]', v_ref, v_when, v_when)
    RETURNING id INTO v_tx_id;

    UPDATE public.club_journal_entries SET created_at = v_when WHERE transaction_id = v_tx_id;
  END IF;

  -- Card transaction: book the payment gateway fee against the bank account
  PERFORM public.post_gateway_fee(c.club_id, c.id, v_total, 'Recurring card payment [Stitch]', c.club_member_id);

  UPDATE public.stitch_collections SET posted_at = now() WHERE id = c.id;

  RETURN jsonb_build_object('ok', true, 'settled_fees', v_settled, 'credited', v_remaining, 'tx_id', v_tx_id);
END;
$function$;

-- 3) Mandate first charge: same partial-settlement behaviour.
CREATE OR REPLACE FUNCTION public.record_mandate_initial_payment(_mandate_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  m public.stitch_mandates%ROWTYPE;
  v_when timestamptz;
  v_total numeric;
  v_remaining numeric;
  v_tx_id uuid;
  v_existing_tx uuid;
  v_fee record;
  v_part_ref uuid;
  v_settled integer := 0;
BEGIN
  SELECT * INTO m FROM public.stitch_mandates WHERE id = _mandate_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF m.status <> 'active' THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_active'); END IF;
  IF m.initial_payment_tx_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  SELECT t.id INTO v_existing_tx
  FROM public.member_credit_transactions t
  JOIN public.stitch_collections c ON t.reference = 'stitch-col:' || c.id::text
  WHERE c.mandate_id = m.id
  ORDER BY t.created_at ASC
  LIMIT 1;
  IF v_existing_tx IS NOT NULL THEN
    UPDATE public.stitch_mandates
      SET initial_payment_tx_id = v_existing_tx
    WHERE id = m.id;
    RETURN jsonb_build_object('ok', true, 'already', true, 'reason', 'collection_recorded');
  END IF;

  v_when := COALESCE(m.authorised_at, m.updated_at, now());

  v_total := COALESCE(
    m.initial_amount_cents,
    CASE WHEN m.mandate_type = 'subscription' THEN m.max_amount_cents ELSE 0 END
  )::numeric / 100.0;
  IF v_total <= 0 THEN RETURN jsonb_build_object('ok', true, 'skipped', 'no_initial_charge'); END IF;

  IF EXISTS (
    SELECT 1 FROM public.member_credit_transactions
    WHERE club_member_id = m.club_member_id
      AND method = 'card'
      AND reference = COALESCE(m.stitch_mandate_id, m.id::text)
  ) THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  v_remaining := v_total;

  FOR v_fee IN
    SELECT id, amount, fee_label
    FROM public.club_member_fee_payments
    WHERE club_member_id = m.club_member_id
      AND paid IS NOT TRUE
      AND COALESCE(amount, 0) > 0
    ORDER BY created_at ASC
  LOOP
    EXIT WHEN v_remaining <= 0;
    IF v_fee.amount <= v_remaining THEN
      UPDATE public.club_member_fee_payments
        SET paid = true, paid_at = v_when
      WHERE id = v_fee.id;
      UPDATE public.club_journal_entries
        SET created_at = v_when
      WHERE fee_payment_id = v_fee.id AND credit > 0 AND account = 'debtors';
      UPDATE public.club_journal_entries
        SET created_at = v_when
      WHERE fee_payment_id = v_fee.id AND debit > 0 AND account = 'bank_current';
      v_remaining := v_remaining - v_fee.amount;
      v_settled := v_settled + 1;
    ELSE
      -- Partial instalment: reduce the outstanding fee and book the payment.
      v_part_ref := gen_random_uuid();
      INSERT INTO public.club_journal_entries
        (club_id, club_member_id, fee_payment_id, account, debit, credit, description, journal_ref, created_at)
      VALUES
        (m.club_id, m.club_member_id, v_fee.id, 'bank_current', v_remaining, 0,
         'Part payment: ' || COALESCE(v_fee.fee_label, 'membership') || ' [Stitch]', v_part_ref, v_when),
        (m.club_id, m.club_member_id, v_fee.id, 'debtors', 0, v_remaining,
         'Part payment: ' || COALESCE(v_fee.fee_label, 'membership') || ' [Stitch]', v_part_ref, v_when);
      UPDATE public.club_member_fee_payments SET amount = amount - v_remaining WHERE id = v_fee.id;
      v_remaining := 0;
      v_settled := v_settled + 1;
    END IF;
  END LOOP;

  IF v_remaining > 0 THEN
    INSERT INTO public.member_credit_transactions
      (user_id, club_id, club_member_id, amount, type, method, status,
       description, reference, created_at, confirmed_at)
    VALUES
      (m.user_id, m.club_id, m.club_member_id, v_remaining, 'debit', 'card', 'confirmed',
       'Recurring payment setup - first charge [Stitch]',
       COALESCE(m.stitch_mandate_id, m.id::text), v_when, v_when)
    RETURNING id INTO v_tx_id;

    UPDATE public.club_journal_entries
      SET created_at = v_when
    WHERE transaction_id = v_tx_id;
  END IF;

  PERFORM public.post_gateway_fee(m.club_id, m.id, v_total, 'Recurring payment setup - first charge [Stitch]', m.club_member_id);

  UPDATE public.stitch_mandates
    SET initial_payment_tx_id = COALESCE(v_tx_id, m.id),
        initial_amount_cents = COALESCE(initial_amount_cents, (v_total * 100)::int)
  WHERE id = m.id;

  RETURN jsonb_build_object(
    'ok', true, 'amount', v_total, 'fees_settled', v_settled,
    'on_account', v_remaining, 'effective_date', v_when
  );
END;
$function$;