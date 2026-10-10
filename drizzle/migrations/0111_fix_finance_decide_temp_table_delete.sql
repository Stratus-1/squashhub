CREATE OR REPLACE FUNCTION public.finance_decide_member_transaction(_tx_id uuid, _approve boolean, _reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  tx record; v_uid uuid := auth.uid(); v_name text; v_desc text;
  fee record; v_remaining numeric; v_ded numeric; v_partial numeric := 0; v_remainder numeric := 0;
  v_posted boolean := false; v_mandate boolean; v_amt numeric; v_matched int := 0;
  v_new boolean; v_source text := 'legacy:finance';
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT * INTO tx FROM member_credit_transactions WHERE id = _tx_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found'; END IF;
  v_new := public.club_new_perms_on(tx.club_id);
  IF v_new THEN
    IF NOT public.has_cap(v_uid, tx.club_id, 'fin.approve') THEN
      RAISE EXCEPTION 'You do not have permission to approve payments for this club';
    END IF;
    IF tx.user_id IS NOT NULL AND tx.user_id = v_uid THEN
      RAISE EXCEPTION 'You cannot approve or reject your own payment — another finance approver must do it';
    END IF;
    v_source := 'cap:fin.approve';
  ELSIF NOT public.is_club_admin_or_permitted(v_uid, tx.club_id, 'finance') THEN
    RAISE EXCEPTION 'You do not have Club Books permission for this club';
  END IF;
  IF tx.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'already', tx.status, 'confirmed_at', tx.confirmed_at);
  END IF;

  IF NOT _approve THEN
    UPDATE member_credit_transactions SET status = 'rejected', confirmed_by = v_uid WHERE id = tx.id;
    INSERT INTO audit_events (club_id, actor_user_id, entity_type, entity_id, action, reason, before_data, after_data)
    VALUES (tx.club_id, v_uid, 'member_credit_transaction', tx.id, 'payment_rejected', _reason,
            jsonb_build_object('status', 'pending', 'amount', tx.amount, 'captured_by', tx.user_id, 'captured_at', tx.created_at),
            jsonb_build_object('status', 'rejected', 'authorised_by', v_source, 'decided_at', now()));
    RETURN jsonb_build_object('ok', true, 'status', 'rejected');
  END IF;

  UPDATE member_credit_transactions SET status = 'confirmed', confirmed_at = now(), confirmed_by = v_uid WHERE id = tx.id;
  SELECT COALESCE(name, 'Member') INTO v_name FROM club_members WHERE id = tx.club_member_id;

  IF tx.type = 'debit' AND tx.club_member_id IS NOT NULL THEN
    CREATE TEMP TABLE IF NOT EXISTS _fd_fees(id uuid, amount numeric, ded numeric) ON COMMIT DROP;
    TRUNCATE _fd_fees;
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
          jsonb_build_object('status', 'pending', 'amount', tx.amount, 'method', tx.method, 'captured_by', tx.user_id, 'captured_at', tx.created_at),
          jsonb_build_object('status', 'confirmed', 'fees_settled', v_posted, 'partial', v_partial, 'remainder', v_remainder, 'authorised_by', v_source, 'decided_at', now()));
  RETURN jsonb_build_object('ok', true, 'status', 'confirmed');
END $function$;