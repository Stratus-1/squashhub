
-- 1) Atomic invoice issuer: posts member sub-ledger debit AND triggers GL via invoice_issued_at
CREATE OR REPLACE FUNCTION public.issue_member_invoice(_fee_payment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fp record;
  v_cm record;
  v_existing uuid;
  v_tx_id uuid;
BEGIN
  SELECT * INTO v_fp FROM public.club_member_fee_payments WHERE id = _fee_payment_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'fee_payment_not_found');
  END IF;

  SELECT id, club_id, user_id, name, email INTO v_cm
  FROM public.club_members WHERE id = v_fp.club_member_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'member_not_found');
  END IF;

  -- Mark invoice issued (fires journal_fee_issued trigger -> GL Dr Debtors / Cr Income)
  IF v_fp.invoice_issued_at IS NULL THEN
    UPDATE public.club_member_fee_payments
    SET invoice_issued_at = now()
    WHERE id = _fee_payment_id;
  END IF;

  -- Idempotent member sub-ledger debit keyed off invoice_number
  SELECT id INTO v_existing
  FROM public.member_credit_transactions
  WHERE club_id = v_cm.club_id
    AND reference = v_fp.invoice_number
    AND type = 'debit'
  LIMIT 1;

  IF v_existing IS NULL AND COALESCE(v_fp.amount, 0) > 0 THEN
    INSERT INTO public.member_credit_transactions
      (club_id, club_member_id, user_id, type, method, amount, description, reference, status, confirmed_at)
    VALUES
      (v_cm.club_id, v_cm.id, v_cm.user_id, 'debit', 'invoice',
       v_fp.amount,
       COALESCE(v_fp.fee_label, 'Invoice') || ' — invoice ' || v_fp.invoice_number,
       v_fp.invoice_number, 'confirmed', now())
    RETURNING id INTO v_tx_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'fee_payment_id', _fee_payment_id,
    'transaction_id', COALESCE(v_tx_id, v_existing),
    'invoice_number', v_fp.invoice_number,
    'amount', v_fp.amount
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.issue_member_invoice(uuid) TO authenticated, service_role;

-- 2) Reconciliation view: mismatches between member sub-ledger and GL
CREATE OR REPLACE VIEW public.v_ledger_reconciliation AS
WITH gl_invoices AS (
  -- One row per issued invoice from the GL side (debtors leg)
  SELECT
    je.club_id,
    je.club_member_id,
    je.fee_payment_id,
    fp.invoice_number,
    SUM(je.debit) AS gl_amount
  FROM public.club_journal_entries je
  JOIN public.club_member_fee_payments fp ON fp.id = je.fee_payment_id
  WHERE je.account = 'debtors'
  GROUP BY je.club_id, je.club_member_id, je.fee_payment_id, fp.invoice_number
),
sub_invoices AS (
  -- One row per invoice charge from the member sub-ledger
  SELECT
    club_id,
    club_member_id,
    reference AS invoice_number,
    SUM(amount) AS sub_amount
  FROM public.member_credit_transactions
  WHERE type = 'debit'
    AND method = 'invoice'
    AND reference IS NOT NULL
  GROUP BY club_id, club_member_id, reference
)
SELECT
  COALESCE(g.club_id, s.club_id) AS club_id,
  COALESCE(g.club_member_id, s.club_member_id) AS club_member_id,
  COALESCE(g.invoice_number, s.invoice_number) AS invoice_number,
  g.fee_payment_id,
  COALESCE(g.gl_amount, 0) AS gl_amount,
  COALESCE(s.sub_amount, 0) AS sub_amount,
  CASE
    WHEN g.invoice_number IS NULL THEN 'missing_in_gl'
    WHEN s.invoice_number IS NULL THEN 'missing_in_sub_ledger'
    WHEN ROUND(COALESCE(g.gl_amount,0),2) <> ROUND(COALESCE(s.sub_amount,0),2) THEN 'amount_mismatch'
    ELSE 'ok'
  END AS status
FROM gl_invoices g
FULL OUTER JOIN sub_invoices s
  ON s.club_id = g.club_id
 AND s.club_member_id = g.club_member_id
 AND s.invoice_number = g.invoice_number;

GRANT SELECT ON public.v_ledger_reconciliation TO authenticated, service_role;
