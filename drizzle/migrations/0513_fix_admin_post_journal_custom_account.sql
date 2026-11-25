CREATE OR REPLACE FUNCTION public.admin_post_journal(_club_id uuid, _date date, _reference text, _reason text, _lines jsonb, _request_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid(); l jsonb; v_lines jsonb := '[]'::jsonb; acct text; cust uuid; g record;
  dr numeric; cr numeric; mem uuid; tdr numeric := 0; tcr numeric := 0;
  v_reason text := btrim(coalesce(_reason, '')); v_ref text := nullif(btrim(coalesce(_reference, '')), '');
  v_payload jsonb; v_existing jsonb;
BEGIN
  IF uid IS NULL OR NOT public.is_club_finance_writer(uid, _club_id) THEN
    RAISE EXCEPTION 'Only club admins or people with Finance permission can post journal entries' USING ERRCODE = '42501';
  END IF;
  IF NOT public.chairman_financial_write_allowed(_club_id) THEN
    RAISE EXCEPTION 'Chairman financial access is view-only' USING ERRCODE = '42501';
  END IF;
  IF _request_id IS NULL THEN RAISE EXCEPTION 'Request ID is required'; END IF;
  IF _date IS NULL OR _date < DATE '2000-01-01' OR _date > (now() AT TIME ZONE 'Africa/Johannesburg')::date + 366 THEN
    RAISE EXCEPTION 'Select a valid date';
  END IF;
  IF length(v_reason) < 1 OR length(v_reason) > 500 THEN RAISE EXCEPTION 'Enter a reason of 1 to 500 characters'; END IF;
  IF v_ref IS NOT NULL AND length(v_ref) > 100 THEN RAISE EXCEPTION 'Keep the reference under 100 characters'; END IF;
  IF jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines) < 2 OR jsonb_array_length(_lines) > 50 THEN
    RAISE EXCEPTION 'A journal needs between 2 and 50 lines';
  END IF;

  FOR l IN SELECT * FROM jsonb_array_elements(_lines) LOOP
    dr := coalesce(nullif(l->>'debit', '')::numeric, 0);
    cr := coalesce(nullif(l->>'credit', '')::numeric, 0);
    IF dr < 0 OR cr < 0 OR (dr > 0 AND cr > 0) OR (dr = 0 AND cr = 0) OR round(dr, 2) <> dr OR round(cr, 2) <> cr THEN
      RAISE EXCEPTION 'Each line needs either a debit or a credit amount (at most two decimals)';
    END IF;
    cust := nullif(l->>'custom_account_id', '')::uuid;
    IF cust IS NOT NULL THEN
      SELECT * INTO g FROM public.club_gl_accounts WHERE id = cust AND club_id = _club_id AND is_active;
      IF NOT FOUND THEN RAISE EXCEPTION 'That club account is not available'; END IF;
      acct := coalesce(g.base_account::text, CASE g.category WHEN 'Asset' THEN 'other_assets' WHEN 'Liability' THEN 'creditors'
                                                       WHEN 'Income' THEN 'fee_income' ELSE 'general_expense' END);
    ELSE
      acct := l->>'account';
      IF acct IS NULL OR NOT (acct = ANY (enum_range(NULL::public.gl_account)::text[])) THEN
        RAISE EXCEPTION 'Unknown account on a journal line';
      END IF;
    END IF;
    mem := nullif(l->>'member_id', '')::uuid;
    IF acct IN ('debtors', 'member_credits') THEN
      IF mem IS NULL THEN RAISE EXCEPTION 'Choose the member for every Accounts Receivable or Member Credits line'; END IF;
      IF NOT EXISTS (SELECT 1 FROM public.club_members WHERE id = mem AND club_id = _club_id) THEN
        RAISE EXCEPTION 'That member does not belong to this club';
      END IF;
    ELSIF mem IS NOT NULL THEN
      RAISE EXCEPTION 'Only Accounts Receivable or Member Credits lines can carry a member';
    END IF;
    tdr := tdr + dr; tcr := tcr + cr;
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'account', acct, 'custom_account_id', cust, 'debit', dr, 'credit', cr, 'member_id', mem,
      'description', coalesce(nullif(btrim(l->>'description'), ''), v_reason)));
  END LOOP;
  IF tdr <> tcr THEN RAISE EXCEPTION 'Debits (%) and credits (%) must be equal', tdr, tcr; END IF;

  v_payload := jsonb_build_object('type', 'manual_journal', 'date', _date, 'reference', v_ref, 'reason', v_reason, 'lines', v_lines);
  PERFORM pg_advisory_xact_lock(hashtextextended(_request_id::text, 0));
  IF EXISTS (SELECT 1 FROM public.club_journal_entries WHERE journal_ref = _request_id) THEN
    SELECT after_json INTO v_existing FROM public.ledger_audit_log
     WHERE journal_ref = _request_id AND club_id = _club_id AND action = 'create' AND after_json->>'type' = 'manual_journal' LIMIT 1;
    IF v_existing IS DISTINCT FROM v_payload THEN RAISE EXCEPTION 'Request ID already used for a different entry'; END IF;
    RETURN jsonb_build_object('ok', true, 'journal_ref', _request_id);
  END IF;

  PERFORM public.post_journal(_club_id, v_lines, _request_id, v_reason);
  UPDATE public.club_journal_entries
     SET created_at = (_date::timestamp + time '12:00') AT TIME ZONE 'Africa/Johannesburg'
   WHERE club_id = _club_id AND journal_ref = _request_id;
  INSERT INTO public.ledger_audit_log (club_id, journal_ref, action, actor_user_id, after_json, note)
  VALUES (_club_id, _request_id, 'create', uid, v_payload, 'Manual journal' || coalesce(' (' || v_ref || ')', ''));
  RETURN jsonb_build_object('ok', true, 'journal_ref', _request_id);
END $function$;