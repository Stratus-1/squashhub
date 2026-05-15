CREATE OR REPLACE FUNCTION public.reset_club_finances(p_club_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_journal_count int := 0;
  v_tx_count int := 0;
  v_fee_count int := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_club_admin_or_permitted(auth.uid(), p_club_id, 'finance') THEN
    RAISE EXCEPTION 'Forbidden: club admin or finance permission required';
  END IF;

  DELETE FROM public.club_journal_entries WHERE club_id = p_club_id;
  GET DIAGNOSTICS v_journal_count = ROW_COUNT;

  DELETE FROM public.member_credit_transactions WHERE club_id = p_club_id;
  GET DIAGNOSTICS v_tx_count = ROW_COUNT;

  DELETE FROM public.club_member_fee_payments
    WHERE club_member_id IN (SELECT id FROM public.club_members WHERE club_id = p_club_id);
  GET DIAGNOSTICS v_fee_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'journal_entries_deleted', v_journal_count,
    'transactions_deleted', v_tx_count,
    'fee_payments_deleted', v_fee_count
  );
END;
$function$;