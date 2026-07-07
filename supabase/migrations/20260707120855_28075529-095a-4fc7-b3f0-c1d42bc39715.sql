
CREATE OR REPLACE FUNCTION public.issue_member_invoice(_fee_payment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_fp record;
BEGIN
  SELECT * INTO v_fp FROM public.club_member_fee_payments WHERE id = _fee_payment_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'fee_payment_not_found');
  END IF;

  IF v_fp.invoice_issued_at IS NULL THEN
    UPDATE public.club_member_fee_payments
    SET invoice_issued_at = now()
    WHERE id = _fee_payment_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'fee_payment_id', _fee_payment_id,
    'invoice_number', v_fp.invoice_number,
    'amount', v_fp.amount
  );
END;
$function$;

-- Delete phantom "invoice issued" ledger rows for still-unpaid fees.
DELETE FROM public.member_credit_transactions mct
USING public.club_member_fee_payments fp,
      public.club_members cm
WHERE mct.method = 'invoice'
  AND mct.type = 'debit'
  AND fp.invoice_number = mct.reference
  AND fp.club_member_id = cm.id
  AND cm.club_id = mct.club_id
  AND COALESCE(fp.paid, false) = false;
