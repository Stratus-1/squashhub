-- Treasurers (club-scoped 'finance' permission) may view their club's member payment transactions.
DROP POLICY IF EXISTS "Finance staff view club member credit transactions" ON public.member_credit_transactions;
CREATE POLICY "Finance staff view club member credit transactions" ON public.member_credit_transactions
  FOR SELECT TO authenticated
  USING (public.is_club_admin_or_permitted(auth.uid(), club_id, 'finance'));

DROP POLICY IF EXISTS "Finance staff read club payment proofs" ON storage.objects;
CREATE POLICY "Finance staff read club payment proofs" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'payment-proofs'
         AND (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
         AND public.is_club_admin_or_permitted(auth.uid(), ((storage.foldername(name))[1])::uuid, 'finance'));

-- Approve / reject one pending member payment. Server-side permission check,
-- row lock + pending-only so a second tap or second device can never post twice.
-- Posting mirrors FinanceTab.handleConfirmPayment exactly.
CREATE OR REPLACE FUNCTION public.finance_decide_member_transaction(_tx_id uuid, _approve boolean, _reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  tx record; v_uid uuid := auth.uid(); v_name text; v_desc text;
  fee record; v_remaining numeric; v_ded numeric; v_partial numeric := 0; v_remainder numeric := 0;
  v_posted boolean := false; v_mandate boolean; v_amt numeric; v_matched int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT * INTO tx FROM member_credit_transactions WHERE id = _tx_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found'; END IF;
  IF NOT public.is_club_admin_or_permitted(v_uid, tx.club_id, 'finance') THEN
    RAISE EXCEPTION 'You do not have Club Books permission for this club';
  END IF;
  IF tx.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'already', tx.status, 'confirmed_at', tx.confirmed_at);
  END IF;

  IF NOT _approve THEN
    UPDATE member_credit_transactions SET status = 'rejected', confirmed_by = v_uid WHERE id = tx.id;
    INSERT INTO audit_events (club_id, actor_user_id, entity_type, entity_id, action, reason, before_data, after_data)
    VALUES (tx.club_id, v_uid, 'member_credit_transaction', tx.id, 'payment_rejected', _reason,
            jsonb_build_object('status', 'pending', 'amount', tx.amount), jsonb_build_object('status', 'rejected'));
    RETURN jsonb_build_object('ok', true, 'status', 'rejected');
  END IF;

  UPDATE member_credit_transactions SET status = 'confirmed', confirmed_at = now(), confirmed_by = v_uid WHERE id = tx.id;
  SELECT COALESCE(name, 'Member') INTO v_name FROM club_members WHERE id = tx.club_member_id;

  IF tx.type = 'debit' AND tx.club_member_id IS NOT NULL THEN
    CREATE TEMP TABLE IF NOT EXISTS _fd_fees(id uuid, amount numeric, ded numeric) ON COMMIT DROP;
    DELETE FROM _fd_fees;
    IF tx.fee_payment_id IS NOT NULL THEN
      INSERT INTO _fd_fees SELECT f.id, f.amount, NULL FROM club_member_fee_payments f
        WHERE f.id = tx.fee_payment_id AND f.club_member_id = tx.club_member_id AND f.paid = false;
    END IF;
    SELECT count(*) INTO v_matched FROM _fd_fees;
    IF v_matched = 0 THEN
      INSERT INTO _fd_fees SELECT f.id, f.amount, NULL FROM club_member_fee_payments f
        WHERE f.club_member_id = tx.club_member_id AND f.paid = false
          AND COALESCE(f.fee_label,'') <> '' AND position(f.fee_label in COALESCE(tx.description,'')) > 0;
      SELECT count(*) INTO v_matched FROM _fd_fees;
    END IF;
    IF v_matched = 0 AND COALESCE(tx.description,'') ~* 'top[- ]?up' THEN
      SELECT EXISTS (SELECT 1 FROM stitch_mandates WHERE club_member_id = tx.club_member_id
        AND status = 'active' AND frequency = 'monthly' AND suspended_at IS NULL) INTO v_mandate;
      v_remaining := abs(tx.amount);
      IF NOT v_mandate THEN
        FOR fee IN SELECT f.id, f.amount FROM club_member_fee_payments f
            WHERE f.club_member_id = tx.club_member_id AND f.paid = false ORDER BY f.created_at LOOP
          EXIT WHEN v_remaining <= 0;
          CONTINUE WHEN fee.amount <= 0;
          v_ded := LEAST(v_remaining, fee.amount);
          v_remaining := v_remaining - v_ded;
          INSERT INTO _fd_fees VALUES (fee.id, fee.amount, v_ded);
        END LOOP;
      END IF;
      v_remainder := GREATEST(0, v_remaining);
    END IF;
    FOR fee IN SELECT * FROM _fd_fees LOOP
      IF fee.ded IS NOT NULL AND fee.ded < fee.amount - 0.001 THEN
        UPDATE club_member_fee_payments SET amount = fee.amount - fee.ded WHERE id = fee.id;
        v_partial := v_partial + fee.ded;
      ELSE
        UPDATE club_member_fee_payments SET paid = true, paid_at = now() WHERE id = fee.id;
      END IF;
      v_posted := true;
    END LOOP;
    IF v_partial > 0 THEN
      v_desc := 'Part payment received: ' || COALESCE(tx.description, 'EFT') || ' — ' || v_name;
      PERFORM post_journal(tx.club_id, jsonb_build_array(
        jsonb_build_object('account','bank_current','debit',v_partial,'description',v_desc,'member_id',tx.club_member_id),
        jsonb_build_object('account','debtors','credit',v_partial,'description',v_desc,'member_id',tx.club_member_id)));
    END IF;
  END IF;

  IF NOT v_posted OR v_remainder > 0 THEN
    v_desc := 'Payment received: ' || COALESCE(tx.description, 'EFT') || ' — ' || v_name;
    v_amt := CASE WHEN v_remainder > 0 THEN v_remainder ELSE abs(tx.amount) END;
    PERFORM post_journal(tx.club_id, jsonb_build_array(
      jsonb_build_object('account','bank_current','debit',v_amt,'description',v_desc,'member_id',tx.club_member_id),
      jsonb_build_object('account','member_credits','credit',v_amt,'description',v_desc,'member_id',tx.club_member_id)));
  END IF;

  INSERT INTO audit_events (club_id, actor_user_id, entity_type, entity_id, action, reason, before_data, after_data)
  VALUES (tx.club_id, v_uid, 'member_credit_transaction', tx.id, 'payment_approved', _reason,
          jsonb_build_object('status', 'pending', 'amount', tx.amount, 'method', tx.method),
          jsonb_build_object('status', 'confirmed', 'fees_settled', v_posted, 'partial', v_partial, 'remainder', v_remainder));
  RETURN jsonb_build_object('ok', true, 'status', 'confirmed');
END $$;
REVOKE ALL ON FUNCTION public.finance_decide_member_transaction(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_decide_member_transaction(uuid, boolean, text) TO authenticated;