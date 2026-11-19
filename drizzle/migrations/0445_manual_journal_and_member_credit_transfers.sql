-- 1. Manual balanced journal (admins / finance permission; chairman view-only)
CREATE OR REPLACE FUNCTION public.admin_post_journal(
  _club_id uuid, _date date, _reference text, _reason text, _lines jsonb, _request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
      acct := coalesce(g.base_account, CASE g.category WHEN 'Asset' THEN 'other_assets' WHEN 'Liability' THEN 'creditors'
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
END $$;

-- 2. Member credit transfers
CREATE TABLE public.member_credit_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  from_member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  to_member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  note text CHECK (note IS NULL OR length(note) <= 300),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','cancelled','expired')),
  requested_by uuid NOT NULL,
  requested_as text NOT NULL DEFAULT 'member' CHECK (requested_as IN ('member','admin')),
  decided_by uuid,
  decided_at timestamptz,
  journal_ref uuid,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT member_credit_transfers_not_self CHECK (from_member_id <> to_member_id)
);
CREATE INDEX member_credit_transfers_club_idx ON public.member_credit_transfers(club_id, status);
CREATE INDEX member_credit_transfers_from_idx ON public.member_credit_transfers(from_member_id);
CREATE INDEX member_credit_transfers_to_idx ON public.member_credit_transfers(to_member_id);
GRANT SELECT ON public.member_credit_transfers TO authenticated;
GRANT ALL ON public.member_credit_transfers TO service_role;
ALTER TABLE public.member_credit_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Parties and finance staff view credit transfers" ON public.member_credit_transfers FOR SELECT TO authenticated
  USING (
    public.is_club_admin_or_permitted(auth.uid(), club_id, 'finance')
    OR EXISTS (SELECT 1 FROM public.club_members cm
               WHERE cm.id IN (member_credit_transfers.from_member_id, member_credit_transfers.to_member_id)
                 AND cm.user_id = auth.uid())
  );

-- Net account credit (positive = member is in credit) from the ledger.
CREATE OR REPLACE FUNCTION public._member_net_credit(_club_id uuid, _member_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(sum(credit) - sum(debit), 0)::numeric FROM public.club_journal_entries
  WHERE club_id = _club_id AND club_member_id = _member_id AND account IN ('debtors', 'member_credits');
$$;
REVOKE ALL ON FUNCTION public._member_net_credit(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Credit a member can still transfer: net credit less pending outgoing transfers.
CREATE OR REPLACE FUNCTION public.member_transferable_credit(_club_id uuid, _member_id uuid)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT (
       EXISTS (SELECT 1 FROM public.club_members WHERE id = _member_id AND club_id = _club_id AND user_id = auth.uid())
       OR public.is_club_admin_or_permitted(auth.uid(), _club_id, 'finance')) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN greatest(0, public._member_net_credit(_club_id, _member_id) - coalesce((
    SELECT sum(amount) FROM public.member_credit_transfers
     WHERE club_id = _club_id AND from_member_id = _member_id AND status = 'pending' AND expires_at > now()), 0));
END $$;

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
  IF t.user_id IS NULL THEN RAISE EXCEPTION '% has no SquashHub login yet, so cannot accept a transfer', t.name; END IF;
  IF _amount IS NULL OR _amount <= 0 OR round(_amount, 2) <> _amount THEN
    RAISE EXCEPTION 'Enter a positive amount with at most two decimal places';
  END IF;
  IF v_note IS NOT NULL AND length(v_note) > 300 THEN RAISE EXCEPTION 'Keep the note under 300 characters'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('credit_transfer:' || _from_member_id::text, 0));
  v_avail := greatest(0, public._member_net_credit(_club_id, _from_member_id) - coalesce((
    SELECT sum(amount) FROM public.member_credit_transfers
     WHERE club_id = _club_id AND from_member_id = _from_member_id AND status = 'pending' AND expires_at > now()), 0));
  IF _amount > v_avail THEN RAISE EXCEPTION 'Only % credit is available to transfer', to_char(v_avail, 'FM999999990.00'); END IF;

  INSERT INTO public.member_credit_transfers(club_id, from_member_id, to_member_id, amount, note, requested_by, requested_as)
  VALUES (_club_id, _from_member_id, _to_member_id, _amount, v_note, uid, v_as) RETURNING id INTO v_id;
  INSERT INTO public.notifications(user_id, club_member_id, title, message, type, url, data)
  VALUES (t.user_id, t.id, 'Credit transfer waiting',
          f.name || ' wants to transfer ' || to_char(_amount, 'FM999999990.00') || ' credit to your account. Open My Account to accept or decline.',
          'credit_transfer', '/my-account', jsonb_build_object('transfer_id', v_id, 'club_id', _club_id));
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.respond_member_credit_transfer(_transfer_id uuid, _accept boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); tr record; f record; t record; v_net numeric; v_mc numeric; v_from_mc numeric; v_from_dr numeric;
  v_ref uuid := gen_random_uuid(); v_debtors numeric; v_credit numeric; v_settle numeric; v_settle_ref uuid;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Please sign in again' USING ERRCODE = '42501'; END IF;
  SELECT * INTO tr FROM public.member_credit_transfers WHERE id = _transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
  SELECT * INTO t FROM public.club_members WHERE id = tr.to_member_id;
  IF t.user_id IS DISTINCT FROM uid THEN RAISE EXCEPTION 'Only the receiving member can answer this transfer' USING ERRCODE = '42501'; END IF;
  IF tr.status = 'pending' AND tr.expires_at <= now() THEN
    UPDATE public.member_credit_transfers SET status = 'expired' WHERE id = tr.id;
    RETURN jsonb_build_object('ok', false, 'status', 'expired');
  END IF;
  IF tr.status <> 'pending' THEN RAISE EXCEPTION 'This transfer is already %', tr.status; END IF;
  SELECT * INTO f FROM public.club_members WHERE id = tr.from_member_id;

  IF NOT coalesce(_accept, false) THEN
    UPDATE public.member_credit_transfers SET status = 'declined', decided_by = uid, decided_at = now() WHERE id = tr.id;
    IF f.user_id IS NOT NULL THEN
      INSERT INTO public.notifications(user_id, club_member_id, title, message, type, url, data)
      VALUES (f.user_id, f.id, 'Credit transfer declined', t.name || ' declined your credit transfer of ' || to_char(tr.amount, 'FM999999990.00') || '.',
              'credit_transfer', '/my-account', jsonb_build_object('transfer_id', tr.id));
    END IF;
    RETURN jsonb_build_object('ok', true, 'status', 'declined');
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('credit_transfer:' || tr.from_member_id::text, 0));
  v_net := public._member_net_credit(tr.club_id, tr.from_member_id);
  IF v_net < tr.amount THEN RAISE EXCEPTION '% no longer has enough credit for this transfer', f.name; END IF;
  -- Take the credit from where it sits: prepaid Member Credits first, the rest from Accounts Receivable.
  SELECT coalesce(sum(credit) - sum(debit), 0) INTO v_mc FROM public.club_journal_entries
   WHERE club_id = tr.club_id AND club_member_id = tr.from_member_id AND account = 'member_credits';
  v_from_mc := least(tr.amount, greatest(v_mc, 0));
  v_from_dr := tr.amount - v_from_mc;

  -- Receiving member confirms on their own account (chairman self-action allowed).
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

  -- Settle anything the receiver owes from the new credit (same rule as post_journal).
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

  UPDATE public.member_credit_transfers SET status = 'accepted', decided_by = uid, decided_at = now(), journal_ref = v_ref WHERE id = tr.id;
  INSERT INTO public.ledger_audit_log(club_id, journal_ref, action, actor_user_id, after_json, note)
  VALUES (tr.club_id, v_ref, 'create', uid,
          jsonb_build_object('type', 'member_credit_transfer', 'transfer_id', tr.id, 'from_member_id', tr.from_member_id,
                             'to_member_id', tr.to_member_id, 'amount', tr.amount, 'requested_by', tr.requested_by, 'requested_as', tr.requested_as),
          'Member credit transfer accepted by the receiving member; no income, expense or bank movement');
  IF f.user_id IS NOT NULL THEN
    INSERT INTO public.notifications(user_id, club_member_id, title, message, type, url, data)
    VALUES (f.user_id, f.id, 'Credit transfer accepted', t.name || ' accepted your credit transfer of ' || to_char(tr.amount, 'FM999999990.00') || '.',
            'credit_transfer', '/my-account', jsonb_build_object('transfer_id', tr.id));
  END IF;
  RETURN jsonb_build_object('ok', true, 'status', 'accepted', 'journal_ref', v_ref);
END $$;

CREATE OR REPLACE FUNCTION public.cancel_member_credit_transfer(_transfer_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); tr record;
BEGIN
  SELECT * INTO tr FROM public.member_credit_transfers WHERE id = _transfer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
  IF uid IS NULL OR NOT (
       EXISTS (SELECT 1 FROM public.club_members WHERE id = tr.from_member_id AND user_id = uid)
       OR (public.is_club_finance_writer(uid, tr.club_id) AND public.chairman_financial_write_allowed(tr.club_id))) THEN
    RAISE EXCEPTION 'Only the sender or a club treasurer can cancel this transfer' USING ERRCODE = '42501';
  END IF;
  IF tr.status <> 'pending' THEN RAISE EXCEPTION 'This transfer is already %', tr.status; END IF;
  UPDATE public.member_credit_transfers SET status = 'cancelled', decided_by = uid, decided_at = now() WHERE id = tr.id;
END $$;

-- Transfers with names, for My Account (scope 'mine') or Finance (scope 'club'); marks expired ones on read.
CREATE OR REPLACE FUNCTION public.list_member_credit_transfers(_club_id uuid, _scope text DEFAULT 'mine')
RETURNS TABLE(id uuid, from_member_id uuid, from_name text, to_member_id uuid, to_name text, amount numeric, note text,
              status text, requested_as text, created_at timestamptz, expires_at timestamptz, decided_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Please sign in again' USING ERRCODE = '42501'; END IF;
  IF _scope = 'club' AND NOT public.is_club_admin_or_permitted(uid, _club_id, 'finance') THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  UPDATE public.member_credit_transfers x SET status = 'expired'
   WHERE x.club_id = _club_id AND x.status = 'pending' AND x.expires_at <= now();
  RETURN QUERY
  SELECT x.id, x.from_member_id, fm.name, x.to_member_id, tm.name, x.amount, x.note, x.status, x.requested_as,
         x.created_at, x.expires_at, x.decided_at
  FROM public.member_credit_transfers x
  JOIN public.club_members fm ON fm.id = x.from_member_id
  JOIN public.club_members tm ON tm.id = x.to_member_id
  WHERE x.club_id = _club_id
    AND (_scope = 'club' OR fm.user_id = uid OR tm.user_id = uid)
  ORDER BY x.created_at DESC
  LIMIT 300;
END $$;

REVOKE ALL ON FUNCTION public.admin_post_journal(uuid, date, text, text, jsonb, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.member_transferable_credit(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.request_member_credit_transfer(uuid, uuid, uuid, numeric, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.respond_member_credit_transfer(uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_member_credit_transfer(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_member_credit_transfers(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_post_journal(uuid, date, text, text, jsonb, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.member_transferable_credit(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.request_member_credit_transfer(uuid, uuid, uuid, numeric, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.respond_member_credit_transfer(uuid, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_member_credit_transfer(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_member_credit_transfers(uuid, text) TO authenticated, service_role;