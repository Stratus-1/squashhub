CREATE OR REPLACE FUNCTION public.admin_delete_journal_group(_journal_ref uuid, _note text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _club_id uuid; _before jsonb; _fee_payment_ids uuid[];
BEGIN
  SELECT club_id INTO _club_id FROM public.club_journal_entries WHERE journal_ref = _journal_ref LIMIT 1;
  IF _club_id IS NULL THEN RAISE EXCEPTION 'Journal group not found'; END IF;
  IF NOT (public.is_club_admin(auth.uid(), _club_id) OR public.has_club_permission(auth.uid(), _club_id, 'finance')) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  SELECT jsonb_agg(to_jsonb(j)) INTO _before FROM public.club_journal_entries j WHERE j.journal_ref = _journal_ref;
  SELECT array_agg(DISTINCT fee_payment_id) INTO _fee_payment_ids FROM public.club_journal_entries
  WHERE journal_ref = _journal_ref AND fee_payment_id IS NOT NULL;
  DELETE FROM public.club_journal_entries WHERE journal_ref = _journal_ref;
  IF _fee_payment_ids IS NOT NULL THEN
    DELETE FROM public.club_member_fee_payments f WHERE f.id = ANY(_fee_payment_ids)
      AND NOT EXISTS (SELECT 1 FROM public.club_journal_entries j2 WHERE j2.fee_payment_id = f.id);
  END IF;
  INSERT INTO public.ledger_audit_log(club_id, journal_ref, action, actor_user_id, before_json, after_json, note)
  VALUES (_club_id, _journal_ref, 'delete', auth.uid(), _before, NULL, _note);
  RETURN jsonb_build_object('ok', true, 'journal_ref', _journal_ref);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_reverse_journal_group(_journal_ref uuid, _note text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _club_id uuid; _new_ref uuid := gen_random_uuid(); _exists_reversal boolean;
BEGIN
  SELECT club_id INTO _club_id FROM public.club_journal_entries WHERE journal_ref = _journal_ref LIMIT 1;
  IF _club_id IS NULL THEN RAISE EXCEPTION 'Journal group not found'; END IF;
  IF NOT (public.is_club_admin(auth.uid(), _club_id) OR public.has_club_permission(auth.uid(), _club_id, 'finance')) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  SELECT EXISTS(SELECT 1 FROM public.club_journal_entries WHERE reverses_journal_ref = _journal_ref) INTO _exists_reversal;
  IF _exists_reversal THEN RAISE EXCEPTION 'This entry has already been reversed'; END IF;
  INSERT INTO public.club_journal_entries(club_id, journal_ref, account, debit, credit, description,
    club_member_id, fee_payment_id, transaction_id, reverses_journal_ref, created_at)
  SELECT club_id, _new_ref, account, credit, debit,
    'Reversal: ' || description || COALESCE(' (' || _note || ')', ''),
    club_member_id, NULL, NULL, _journal_ref, now()
  FROM public.club_journal_entries WHERE journal_ref = _journal_ref;
  INSERT INTO public.ledger_audit_log(club_id, journal_ref, action, actor_user_id, note)
  VALUES (_club_id, _journal_ref, 'reverse', auth.uid(), _note);
  RETURN jsonb_build_object('ok', true, 'new_journal_ref', _new_ref);
END;
$function$;

DROP POLICY IF EXISTS "Bar or finance permission can view bar tabs" ON public.bar_tab_entries;
CREATE POLICY "Bar or finance permission can view bar tabs" ON public.bar_tab_entries
  FOR SELECT TO authenticated
  USING (public.has_club_permission(auth.uid(), club_id, 'bar') OR public.has_club_permission(auth.uid(), club_id, 'finance'));