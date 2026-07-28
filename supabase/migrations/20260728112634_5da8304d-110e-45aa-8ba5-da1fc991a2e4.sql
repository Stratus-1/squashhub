CREATE OR REPLACE FUNCTION public.record_mandate_initial_payment(_mandate_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  m public.stitch_mandates%ROWTYPE;
  v_when timestamptz;
  v_total numeric;
  v_remaining numeric;
  v_tx_id uuid;
  v_fee record;
  v_settled integer := 0;
BEGIN
  SELECT * INTO m FROM public.stitch_mandates WHERE id = _mandate_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF m.status <> 'active' THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_active'); END IF;
  IF m.initial_payment_tx_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  v_when := COALESCE(m.authorised_at, m.updated_at, now());

  -- The first instalment of a recurring arrangement is the full subscription
  -- amount (not a token verification charge).
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
    SELECT id, amount
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

  UPDATE public.stitch_mandates
    SET initial_payment_tx_id = COALESCE(v_tx_id, m.id),
        initial_amount_cents = COALESCE(initial_amount_cents, (v_total * 100)::int)
  WHERE id = m.id;

  RETURN jsonb_build_object(
    'ok', true, 'amount', v_total, 'fees_settled', v_settled,
    'on_account', v_remaining, 'effective_date', v_when
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_mandate_initial_payment(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_mandate_initial_payment(uuid) TO service_role;