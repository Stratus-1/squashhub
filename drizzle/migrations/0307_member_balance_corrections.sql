CREATE OR REPLACE FUNCTION public.admin_post_member_correction(_club_id uuid, _club_member_id uuid, _amount numeric, _description text, _date timestamptz, _request_id uuid, _direction text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_amount numeric; v_description text; v_existing jsonb; v_payload jsonb; v_up boolean;
BEGIN
  IF NOT public.chairman_financial_write_allowed(_club_id) THEN RAISE EXCEPTION 'Chairman financial access is view-only' USING ERRCODE='42501'; END IF;
  IF auth.uid() IS NULL OR NOT (public.is_club_admin(auth.uid(), _club_id) OR public.has_club_permission(auth.uid(), _club_id, 'finance')) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  IF _direction IS NULL OR _direction NOT IN ('up','down') THEN RAISE EXCEPTION 'Choose correction up or correction down'; END IF;
  v_up := _direction = 'up';
  IF NOT EXISTS (SELECT 1 FROM public.club_members WHERE id = _club_member_id AND club_id = _club_id) THEN RAISE EXCEPTION 'Member does not belong to this club'; END IF;
  IF _amount IS NULL OR _amount::text IN ('NaN','Infinity','-Infinity') OR _amount <= 0 OR round(_amount,2) <> _amount THEN RAISE EXCEPTION 'Enter a positive amount with at most two decimal places'; END IF;
  v_amount := round(_amount,2);
  v_description := btrim(_description);
  IF v_description IS NULL OR length(v_description) < 1 OR length(v_description) > 500 THEN RAISE EXCEPTION 'Enter a reason of 1 to 500 characters'; END IF;
  IF _date IS NULL OR NOT isfinite(_date) OR _request_id IS NULL THEN RAISE EXCEPTION 'Date and request ID are required'; END IF;
  v_payload := jsonb_build_object('member_id',_club_member_id,'amount',v_amount,'description',v_description,'date',_date,'type','member_correction','direction',_direction);
  PERFORM pg_advisory_xact_lock(hashtextextended(_request_id::text,0));
  IF EXISTS (SELECT 1 FROM public.club_journal_entries WHERE journal_ref = _request_id) THEN
    SELECT after_json INTO v_existing FROM public.ledger_audit_log WHERE journal_ref=_request_id AND club_id=_club_id AND action='create' AND after_json->>'type'='member_correction' LIMIT 1;
    IF v_existing IS DISTINCT FROM v_payload THEN RAISE EXCEPTION 'Request ID already used for a different entry'; END IF;
    RETURN jsonb_build_object('ok',true,'journal_ref',_request_id);
  END IF;
  INSERT INTO public.club_journal_entries (club_id, journal_ref, account, debit, credit, description, club_member_id, created_at) VALUES
    (_club_id,_request_id,'debtors', CASE WHEN v_up THEN v_amount ELSE 0 END, CASE WHEN v_up THEN 0 ELSE v_amount END,
      CASE WHEN v_up THEN 'Correction up: ' ELSE 'Correction down: ' END || v_description, _club_member_id, _date),
    (_club_id,_request_id,'opening_balance_equity', CASE WHEN v_up THEN 0 ELSE v_amount END, CASE WHEN v_up THEN v_amount ELSE 0 END,
      'Member balance correction: ' || v_description, NULL, _date);
  INSERT INTO public.ledger_audit_log (club_id, journal_ref, action, actor_user_id, after_json, note)
  VALUES (_club_id,_request_id,'create',auth.uid(),v_payload,'Member account correction ('||_direction||'); no payment or income recognised');
  RETURN jsonb_build_object('ok',true,'journal_ref',_request_id);
END; $function$;
REVOKE ALL ON FUNCTION public.admin_post_member_correction(uuid,uuid,numeric,text,timestamptz,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_post_member_correction(uuid,uuid,numeric,text,timestamptz,uuid,text) TO authenticated, service_role;