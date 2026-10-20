CREATE OR REPLACE FUNCTION public.admin_add_member_outstanding_balance(
  _club_id uuid, _club_member_id uuid, _amount numeric, _description text,
  _date timestamptz, _request_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_amount numeric;
  v_description text;
  v_existing jsonb;
  v_payload jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT (
    public.is_club_admin(auth.uid(), _club_id)
    OR public.nsc_treasurer_domain_access(auth.uid(), _club_id, 'finance')
  ) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.club_members WHERE id = _club_member_id AND club_id = _club_id) THEN
    RAISE EXCEPTION 'Member does not belong to this club';
  END IF;
  IF _amount IS NULL OR _amount::text IN ('NaN', 'Infinity', '-Infinity') OR _amount <= 0 OR round(_amount, 2) <> _amount THEN
    RAISE EXCEPTION 'Enter a positive amount with at most two decimal places';
  END IF;
  v_amount := round(_amount, 2);
  v_description := btrim(_description);
  IF v_description IS NULL OR length(v_description) < 1 OR length(v_description) > 500 THEN
    RAISE EXCEPTION 'Enter a description of 1 to 500 characters';
  END IF;
  IF _date IS NULL OR NOT isfinite(_date) OR _request_id IS NULL THEN
    RAISE EXCEPTION 'Date and request ID are required';
  END IF;
  v_payload := jsonb_build_object('member_id', _club_member_id, 'amount', v_amount,
    'description', v_description, 'date', _date, 'type', 'outstanding_balance');
  PERFORM pg_advisory_xact_lock(hashtextextended(_request_id::text, 0));
  IF EXISTS (SELECT 1 FROM public.club_journal_entries WHERE journal_ref = _request_id) THEN
    SELECT after_json INTO v_existing FROM public.ledger_audit_log
      WHERE journal_ref = _request_id AND club_id = _club_id AND action = 'create'
      AND after_json->>'type' = 'outstanding_balance' LIMIT 1;
    IF v_existing IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION 'Request ID already used for a different entry';
    END IF;
    RETURN jsonb_build_object('ok', true, 'journal_ref', _request_id);
  END IF;
  -- Balance-sheet-only adjustment: no fee assessment, receipt, income or expense.
  INSERT INTO public.club_journal_entries
    (club_id, journal_ref, account, debit, credit, description, club_member_id, created_at)
  VALUES
    (_club_id, _request_id, 'debtors', v_amount, 0,
      'Outstanding balance: ' || v_description, _club_member_id, _date),
    (_club_id, _request_id, 'opening_balance_equity', 0, v_amount,
      'Member balance adjustment: ' || v_description, NULL, _date);
  INSERT INTO public.ledger_audit_log
    (club_id, journal_ref, action, actor_user_id, after_json, note)
  VALUES (_club_id, _request_id, 'create', auth.uid(), v_payload,
    'Member outstanding balance adjustment; no payment or income recognised');
  RETURN jsonb_build_object('ok', true, 'journal_ref', _request_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.admin_add_member_outstanding_balance(uuid, uuid, numeric, text, timestamptz, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_add_member_outstanding_balance(uuid, uuid, numeric, text, timestamptz, uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.admin_add_member_outstanding_balance(uuid, uuid, numeric, text, timestamptz, uuid) IS 'Atomic audited member debt adjustment against opening balance equity; club scoped, no fee or payment, retry safe.';