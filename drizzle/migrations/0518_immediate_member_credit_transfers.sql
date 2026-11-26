CREATE OR REPLACE FUNCTION public._settle_member_credit_transfer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tr record; f record; t record; v_net numeric; v_mc numeric; v_from_mc numeric; v_from_dr numeric;
  v_ref uuid := gen_random_uuid(); v_debtors numeric; v_credit numeric; v_settle numeric; v_settle_ref uuid;
  v_previous_self text := current_setting('app.chairman_self_payment', true);
BEGIN
  IF NEW.status <> 'pending' OR NEW.journal_ref IS NOT NULL THEN RETURN NEW; END IF;
  tr := NEW;
  PERFORM pg_advisory_xact_lock(hashtextextended('credit_transfer:' || least(tr.from_member_id, tr.to_member_id)::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('credit_transfer:' || greatest(tr.from_member_id, tr.to_member_id)::text, 0));
  SELECT * INTO f FROM public.club_members WHERE id = tr.from_member_id AND club_id = tr.club_id;
  SELECT * INTO t FROM public.club_members WHERE id = tr.to_member_id AND club_id = tr.club_id;
  IF f.id IS NULL OR t.id IS NULL THEN RAISE EXCEPTION 'Both members must belong to this club'; END IF;
  IF t.role::text = 'visitor' OR t.status::text <> 'active' THEN RAISE EXCEPTION 'Recipient must be an active member'; END IF;
  v_net := public._member_net_credit(tr.club_id, tr.from_member_id);
  IF v_net < tr.amount THEN RAISE EXCEPTION '% no longer has enough credit for this transfer', f.name; END IF;
  SELECT coalesce(sum(credit) - sum(debit), 0) INTO v_mc FROM public.club_journal_entries
   WHERE club_id = tr.club_id AND club_member_id = tr.from_member_id AND account = 'member_credits';
  v_from_mc := least(tr.amount, greatest(v_mc, 0));
  v_from_dr := tr.amount - v_from_mc;
  PERFORM set_config('app.chairman_self_payment', 'on', true);
  IF v_from_mc > 0 THEN
    INSERT INTO public.club_journal_entries(club_id, journal_ref, account, debit, credit, description, club_member_id)
    VALUES (tr.club_id, v_ref, 'member_credits', v_from_mc, 0, 'Credit transferred to ' || t.name || coalesce(': ' || tr.note, ''), tr.from_member_id);
  END IF;
  IF v_from_dr > 0 THEN
    INSERT INTO public.club_journal_entries(club_id, journal_ref, account, debit, credit, description, club_member_id)
    VALUES (tr.club_id, v_ref, 'debtors', v_from_dr, 0, 'Credit transferred to ' || t.name || coalesce(': ' || tr.note, ''), tr.from_member_id);
  END IF;
  INSERT INTO public.club_journal_entries(club_id, journal_ref, account, debit, credit, description, club_member_id)
  VALUES (tr.club_id, v_ref, 'member_credits', 0, tr.amount, 'Credit received from ' || f.name || coalesce(': ' || tr.note, ''), tr.to_member_id);
  SELECT coalesce(sum(debit) - sum(credit), 0) INTO v_debtors FROM public.club_journal_entries
   WHERE club_id = tr.club_id AND club_member_id = tr.to_member_id AND account = 'debtors';
  SELECT coalesce(sum(credit) - sum(debit), 0) INTO v_credit FROM public.club_journal_entries
   WHERE club_id = tr.club_id AND club_member_id = tr.to_member_id AND account = 'member_credits';
  v_settle := least(greatest(v_debtors, 0), greatest(v_credit, 0));
  IF round(v_settle, 2) > 0 THEN
    v_settle_ref := gen_random_uuid();
    INSERT INTO public.club_journal_entries(club_id, journal_ref, account, debit, credit, description, club_member_id) VALUES
      (tr.club_id, v_settle_ref, 'member_credits', v_settle, 0, 'Auto-settled from prepaid credit', tr.to_member_id),
      (tr.club_id, v_settle_ref, 'debtors', 0, v_settle, 'Auto-settled from prepaid credit', tr.to_member_id);
    UPDATE public.club_member_fee_payments SET paid = true, paid_at = coalesce(paid_at, now())
     WHERE id IN (SELECT id FROM public.club_member_fee_payments
                   WHERE club_member_id = tr.to_member_id AND coalesce(paid, false) = false ORDER BY created_at ASC)
       AND amount <= v_settle;
  END IF;
  UPDATE public.member_credit_transfers SET status = 'accepted', decided_by = tr.requested_by, decided_at = now(), journal_ref = v_ref WHERE id = tr.id;
  INSERT INTO public.ledger_audit_log(club_id, journal_ref, action, actor_user_id, after_json, note)
  VALUES (tr.club_id, v_ref, 'create', tr.requested_by,
          jsonb_build_object('type', 'member_credit_transfer', 'transfer_id', tr.id, 'from_member_id', tr.from_member_id,
                             'to_member_id', tr.to_member_id, 'amount', tr.amount, 'requested_by', tr.requested_by, 'requested_as', tr.requested_as),
          'Member credit transferred immediately; no recipient acceptance required; no income, expense or bank movement');
  PERFORM set_config('app.chairman_self_payment', coalesce(v_previous_self, ''), true);
  UPDATE public.notifications SET read = true WHERE type = 'credit_transfer' AND data->>'transfer_id' = tr.id::text;
  IF t.user_id IS NOT NULL THEN
    INSERT INTO public.notifications(user_id, club_member_id, title, message, type, url, data)
    VALUES(t.user_id, t.id, 'Credit received', f.name || ' transferred ' || to_char(tr.amount, 'FM999999990.00') || ' to your member account.',
      'credit_transfer', '/my-account', jsonb_build_object('transfer_id',tr.id,'club_id',tr.club_id));
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._settle_member_credit_transfer() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER settle_member_credit_transfer AFTER INSERT OR UPDATE OF status ON public.member_credit_transfers
FOR EACH ROW WHEN (NEW.status = 'pending' AND NEW.journal_ref IS NULL) EXECUTE FUNCTION public._settle_member_credit_transfer();
CREATE OR REPLACE FUNCTION public.request_member_credit_transfer(
  _club_id uuid, _from_member_id uuid, _to_member_id uuid, _amount numeric, _note text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); v_as text; f record; t record; v_avail numeric; v_id uuid; v_note text := nullif(btrim(coalesce(_note, '')), '');
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Please sign in again' USING ERRCODE = '42501'; END IF;
  SELECT * INTO f FROM public.club_members WHERE id = _from_member_id AND club_id = _club_id;
  SELECT * INTO t FROM public.club_members WHERE id = _to_member_id AND club_id = _club_id;
  IF f.id IS NULL OR t.id IS NULL THEN RAISE EXCEPTION 'Both members must belong to this club'; END IF;
  IF f.id = t.id THEN RAISE EXCEPTION 'Choose a different member to receive the credit'; END IF;
  IF f.user_id = uid THEN v_as := 'member';
  ELSIF public.is_club_finance_writer(uid, _club_id) AND public.chairman_financial_write_allowed(_club_id) THEN v_as := 'admin';
  ELSE RAISE EXCEPTION 'You can only transfer your own credit' USING ERRCODE = '42501';
  END IF;
  IF coalesce(t.role::text, '') = 'visitor' OR coalesce(t.status::text, 'active') <> 'active' THEN
    RAISE EXCEPTION '% is not an active member, so cannot receive credit', t.name;
  END IF;
  IF _amount IS NULL OR _amount <= 0 OR round(_amount, 2) <> _amount THEN
    RAISE EXCEPTION 'Enter a positive amount with at most two decimal places';
  END IF;
  IF v_note IS NOT NULL AND length(v_note) > 300 THEN RAISE EXCEPTION 'Keep the note under 300 characters'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('credit_transfer:' || least(_from_member_id, _to_member_id)::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('credit_transfer:' || greatest(_from_member_id, _to_member_id)::text, 0));
  v_avail := greatest(0, public._member_net_credit(_club_id, _from_member_id) - coalesce((
    SELECT sum(amount) FROM public.member_credit_transfers
     WHERE club_id = _club_id AND from_member_id = _from_member_id AND status = 'pending' AND expires_at > now()), 0));
  IF _amount > v_avail THEN RAISE EXCEPTION 'Only % credit is available to transfer', to_char(v_avail, 'FM999999990.00'); END IF;
  INSERT INTO public.member_credit_transfers(club_id, from_member_id, to_member_id, amount, note, requested_by, requested_as)
  VALUES (_club_id, _from_member_id, _to_member_id, _amount, v_note, uid, v_as) RETURNING id INTO v_id;
  RETURN v_id;
END $$;
CREATE OR REPLACE FUNCTION public.respond_member_credit_transfer(_transfer_id uuid, _accept boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tr record;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in again' USING ERRCODE = '42501'; END IF;
  SELECT x.* INTO tr FROM public.member_credit_transfers x
  JOIN public.club_members m ON m.id = x.to_member_id AND m.club_id = x.club_id
  WHERE x.id = _transfer_id AND m.user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found' USING ERRCODE = '42501'; END IF;
  IF tr.status = 'pending' THEN RAISE EXCEPTION 'Acceptance is no longer required. Ask the sender to complete this older transfer.'; END IF;
  RETURN jsonb_build_object('ok', true, 'status', tr.status, 'journal_ref', tr.journal_ref);
END $$;