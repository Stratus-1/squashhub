CREATE OR REPLACE FUNCTION public.bar_counter_topup_member(
  _club_member_id uuid, _amount numeric, _method text, _request_id uuid, _token uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_club uuid; m record; v_ref uuid; v_tx uuid; v_buffer numeric; v_remaining numeric;
  v_settled numeric := 0; v_labels text := ''; fee record;
BEGIN
  v_club := public.bar_counter_context(_token, NULL);
  IF _amount IS NULL OR _amount <= 0 OR _amount > 100000
     OR _amount::text IN ('NaN','Infinity','-Infinity') OR _amount <> round(_amount, 2) THEN
    RAISE EXCEPTION 'Enter a valid top-up amount';
  END IF;
  IF _method IS DISTINCT FROM 'card' THEN
    RAISE EXCEPTION 'Bar top-ups are card only — cash is not accepted';
  END IF;
  IF _request_id IS NULL THEN RAISE EXCEPTION 'Missing request reference'; END IF;

  SELECT id INTO v_tx FROM public.member_credit_transactions WHERE reference = 'bartopup:' || _request_id::text;
  IF FOUND THEN RETURN jsonb_build_object('already', true, 'transaction_id', v_tx); END IF;

  SELECT id, club_id, user_id, name, status INTO m FROM public.club_members WHERE id = _club_member_id FOR UPDATE;
  IF NOT FOUND OR m.club_id <> v_club THEN RAISE EXCEPTION 'Member not found at this club'; END IF;
  IF m.status <> 'active' THEN RAISE EXCEPTION 'Only active members can top up at the bar'; END IF;

  v_ref := gen_random_uuid(); v_tx := gen_random_uuid();
  INSERT INTO public.club_journal_entries (club_id, club_member_id, account, debit, credit, description, journal_ref) VALUES
    (v_club, m.id, 'bank_current'::public.gl_account, _amount, 0, 'Wallet top-up at bar (card) — ' || m.name, v_ref),
    (v_club, m.id, 'debtors', 0, _amount, 'Wallet top-up at bar (card) — ' || m.name, v_ref);
  INSERT INTO public.member_credit_transactions
    (id, user_id, club_id, club_member_id, amount, type, method, status, description, reference, confirmed_at, confirmed_by)
  VALUES (v_tx, m.user_id, v_club, m.id, _amount, 'topup', 'card', 'confirmed',
     'Wallet top-up at bar (card)', 'bartopup:' || _request_id::text, now(), auth.uid());

  SELECT COALESCE(min_booking_balance, 0) INTO v_buffer FROM public.clubs WHERE id = v_club;
  v_remaining := GREATEST(0, _amount - COALESCE(v_buffer, 0));
  IF v_remaining > 0 AND NOT EXISTS (
    SELECT 1 FROM public.stitch_mandates WHERE club_member_id = m.id AND club_id = v_club AND status = 'active'
      AND frequency = 'monthly' AND suspended_at IS NULL
  ) THEN
    FOR fee IN SELECT id, fee_label, amount FROM public.club_member_fee_payments
      WHERE club_member_id = m.id AND paid = false AND amount > 0 ORDER BY created_at ASC FOR UPDATE
    LOOP
      EXIT WHEN v_remaining <= 0;
      IF v_remaining >= fee.amount - 0.001 THEN
        UPDATE public.club_member_fee_payments SET paid = true, paid_at = now(), settled_from_wallet = true WHERE id = fee.id;
        v_settled := v_settled + fee.amount; v_remaining := v_remaining - fee.amount;
      ELSE
        UPDATE public.club_member_fee_payments SET amount = fee.amount - v_remaining WHERE id = fee.id;
        v_settled := v_settled + v_remaining; v_remaining := 0;
      END IF;
      v_labels := v_labels || CASE WHEN v_labels = '' THEN '' ELSE ', ' END || COALESCE(fee.fee_label, 'Club fee');
    END LOOP;
    IF v_settled > 0 THEN
      INSERT INTO public.member_credit_transactions
        (user_id, club_id, club_member_id, amount, type, method, status, description, reference, confirmed_at, confirmed_by)
      VALUES (m.user_id, v_club, m.id, v_settled, 'debit', 'credit', 'confirmed',
         'Fee payment from wallet: ' || v_labels || ' [bar top-up auto-settle]', 'bartopup-settle:' || _request_id::text, now(), auth.uid());
    END IF;
  END IF;
  RETURN jsonb_build_object('ok', true, 'transaction_id', v_tx, 'member_name', m.name, 'amount', _amount, 'fees_settled', round(v_settled, 2));
END $$;
REVOKE ALL ON FUNCTION public.bar_counter_topup_member(uuid, numeric, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bar_counter_topup_member(uuid, numeric, text, uuid, uuid) TO authenticated;