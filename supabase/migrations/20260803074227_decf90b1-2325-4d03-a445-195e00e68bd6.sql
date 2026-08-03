ALTER TABLE public.stitch_collections
  ADD COLUMN IF NOT EXISTS posted_at timestamptz;

UPDATE public.stitch_collections
SET posted_at = COALESCE(settled_at, updated_at, created_at)
WHERE posted_at IS NULL AND status = 'paid';

CREATE UNIQUE INDEX IF NOT EXISTS member_credit_transactions_stitch_col_ref_uniq
  ON public.member_credit_transactions (reference)
  WHERE reference LIKE 'stitch-col:%';

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
  v_settled integer := 0;
BEGIN
  -- Lock the collection so two concurrent webhook deliveries cannot both post.
  SELECT * INTO c FROM public.stitch_collections WHERE id = _collection_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;

  -- Already posted to the member's account: never post the same money twice.
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

  -- Settle the linked fee first when the collection targets one.
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

  -- Then apply what is left to the member's oldest outstanding fees.
  FOR v_fee IN
    SELECT id, amount
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

  UPDATE public.stitch_collections SET posted_at = now() WHERE id = c.id;

  RETURN jsonb_build_object('ok', true, 'settled_fees', v_settled, 'credited', v_remaining, 'tx_id', v_tx_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.record_collection_payment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_collection_payment(uuid) TO service_role;