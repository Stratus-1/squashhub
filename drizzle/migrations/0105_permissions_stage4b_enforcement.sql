CREATE OR REPLACE FUNCTION public.club_new_perms_on(_club_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE((SELECT NOT s.legacy_mode AND s.new_permissions_enabled
    FROM public.club_permission_settings s WHERE s.club_id = _club_id), false)
$$;
GRANT EXECUTE ON FUNCTION public.club_new_perms_on(uuid) TO authenticated;

-- Finance approvals: new rules + no self-approval only where the club's switch is on.
CREATE OR REPLACE FUNCTION public.finance_decide_member_transaction(_tx_id uuid, _approve boolean, _reason text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
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
          jsonb_build_object('status', 'pending', 'amount', tx.amount, 'method', tx.method, 'captured_by', tx.user_id, 'captured_at', tx.created_at),
          jsonb_build_object('status', 'confirmed', 'fees_settled', v_posted, 'partial', v_partial, 'remainder', v_remainder, 'authorised_by', v_source, 'decided_at', now()));
  RETURN jsonb_build_object('ok', true, 'status', 'confirmed');
END $function$;

-- Counter PINs: Riverside-style clubs need bar.pin.manage; every change audited, PIN never stored in the log.
CREATE OR REPLACE FUNCTION public.bar_counter_set_pin(_club_id uuid, _pin text, _label text DEFAULT 'Bar counter'::text, _device_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_id uuid; v_count int; v_label text; v_clash uuid; v_new boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  v_new := public.club_new_perms_on(_club_id);
  IF v_new THEN
    IF NOT public.has_cap(auth.uid(), _club_id, 'bar.pin.manage') THEN
      RAISE EXCEPTION 'You do not have permission to manage counter PINs for this club';
    END IF;
  ELSIF NOT public.bar_staff_can_serve(auth.uid(), _club_id) THEN
    RAISE EXCEPTION 'You do not have bar permission for this club';
  END IF;
  IF COALESCE(_pin,'') !~ '^[0-9]{4,8}$' THEN RAISE EXCEPTION 'The counter PIN must be 4 to 8 digits'; END IF;
  v_label := COALESCE(NULLIF(btrim(_label),''), 'Bar counter');

  SELECT d.id INTO v_clash FROM public.bar_counter_devices d
   WHERE d.club_id = _club_id AND d.active AND d.pin_hash = crypt(_pin, d.pin_hash)
     AND (_device_id IS NULL OR d.id <> _device_id)
   LIMIT 1;
  IF v_clash IS NOT NULL THEN
    RAISE EXCEPTION 'Another counter person already uses that PIN — please pick a different one';
  END IF;

  IF _device_id IS NOT NULL THEN
    SELECT id INTO v_id FROM public.bar_counter_devices WHERE id = _device_id AND club_id = _club_id AND active;
    IF v_id IS NULL THEN RAISE EXCEPTION 'That counter person no longer exists'; END IF;
  END IF;

  IF v_id IS NULL THEN
    SELECT count(*) INTO v_count FROM public.bar_counter_devices WHERE club_id = _club_id AND active;
    IF v_count >= 10 THEN RAISE EXCEPTION 'A club can have at most 10 counter PINs — remove one first'; END IF;
    INSERT INTO public.bar_counter_devices (club_id, label, pin_hash, created_by)
    VALUES (_club_id, v_label, crypt(_pin, gen_salt('bf')), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.bar_counter_devices
       SET pin_hash = crypt(_pin, gen_salt('bf')), label = v_label, updated_at = now()
     WHERE id = v_id;
    UPDATE public.bar_counter_sessions SET revoked_at = now()
     WHERE device_id = v_id AND revoked_at IS NULL;
  END IF;

  IF v_new THEN
    INSERT INTO public.permission_events (club_id, actor_user_id, event_type, capability_key, detail)
    VALUES (_club_id, auth.uid(), CASE WHEN _device_id IS NULL THEN 'counter_pin_created' ELSE 'counter_pin_reset' END,
            'bar.pin.manage', jsonb_build_object('device_id', v_id, 'label', v_label));
  END IF;
  RETURN jsonb_build_object('device_id', v_id, 'label', v_label);
END; $function$;

-- Grant / deny / remove a personal permission (Chairman or Super Admin, switched-on clubs only).
CREATE OR REPLACE FUNCTION public.perm_set_override(_club_id uuid, _member_id uuid, _capability text, _effect text, _reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); v_actor uuid; v_old text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF NOT public.club_new_perms_on(_club_id) THEN RAISE EXCEPTION 'The new permissions are not switched on for this club'; END IF;
  IF NOT public.can_grant(v_uid, _club_id, _capability) THEN RAISE EXCEPTION 'Only the Chairman can change permissions'; END IF;
  IF NOT EXISTS (SELECT 1 FROM capability_catalogue WHERE key = _capability) THEN RAISE EXCEPTION 'Unknown permission'; END IF;
  IF NOT EXISTS (SELECT 1 FROM club_members WHERE id = _member_id AND club_id = _club_id) THEN RAISE EXCEPTION 'Member not in this club'; END IF;
  IF _effect NOT IN ('grant','deny','remove') THEN RAISE EXCEPTION 'Invalid change'; END IF;
  SELECT id INTO v_actor FROM club_members WHERE club_id = _club_id AND user_id = v_uid LIMIT 1;
  SELECT CASE WHEN revoked_at IS NULL THEN effect END INTO v_old FROM member_capability_overrides
    WHERE club_id = _club_id AND club_member_id = _member_id AND capability_key = _capability FOR UPDATE;

  IF _effect = 'remove' THEN
    UPDATE member_capability_overrides SET revoked_at = now(), revoked_by = v_uid
     WHERE club_id = _club_id AND club_member_id = _member_id AND capability_key = _capability AND revoked_at IS NULL;
  ELSE
    INSERT INTO member_capability_overrides (club_id, club_member_id, capability_key, effect, source, granted_by, reason)
    VALUES (_club_id, _member_id, _capability, _effect, CASE WHEN v_actor = _member_id THEN 'self' ELSE 'personal' END, v_uid, _reason)
    ON CONFLICT (club_id, club_member_id, capability_key) DO UPDATE
      SET effect = EXCLUDED.effect, source = EXCLUDED.source, granted_by = v_uid, reason = EXCLUDED.reason,
          revoked_at = NULL, revoked_by = NULL, created_at = now();
  END IF;

  INSERT INTO permission_events (club_id, actor_user_id, actor_member_id, event_type, target_member_id, capability_key, detail)
  VALUES (_club_id, v_uid, v_actor, 'override_' || _effect, _member_id, _capability,
          jsonb_build_object('before', v_old, 'after', NULLIF(_effect,'remove'), 'reason', _reason, 'self', v_actor = _member_id));
  RETURN jsonb_build_object('ok', true);
END $$;
REVOKE ALL ON FUNCTION public.perm_set_override(uuid,uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.perm_set_override(uuid,uuid,text,text,text) TO authenticated;

-- Matrix for the Club Admin screen: people with offices, roles, overrides or legacy admin rights.
CREATE OR REPLACE FUNCTION public.perm_club_matrix(_club_id uuid)
RETURNS TABLE(club_member_id uuid, name text, offices text[], roles text[], caps text[], grants text[], denies text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.club_new_perms_on(_club_id)
     OR NOT public.can_grant(auth.uid(), _club_id, 'permissions.grant') THEN
    RAISE EXCEPTION 'Only the Chairman can view club permissions';
  END IF;
  RETURN QUERY
  WITH people AS (
    SELECT m.id, m.name, m.user_id FROM club_members m
    WHERE m.club_id = _club_id AND (
      m.role = 'admin' OR m.is_full_admin
      OR EXISTS (SELECT 1 FROM club_offices o WHERE o.club_member_id = m.id AND o.club_id = _club_id AND o.ended_at IS NULL)
      OR EXISTS (SELECT 1 FROM member_role_assignments r WHERE r.club_member_id = m.id AND r.club_id = _club_id AND r.revoked_at IS NULL)
      OR EXISTS (SELECT 1 FROM member_capability_overrides c WHERE c.club_member_id = m.id AND c.club_id = _club_id AND c.revoked_at IS NULL))
  )
  SELECT p.id, p.name::text,
    ARRAY(SELECT o.office FROM club_offices o WHERE o.club_member_id = p.id AND o.club_id = _club_id AND o.ended_at IS NULL),
    ARRAY(SELECT r.role_name FROM member_role_assignments r WHERE r.club_member_id = p.id AND r.club_id = _club_id AND r.revoked_at IS NULL),
    CASE WHEN p.user_id IS NULL THEN ARRAY[]::text[] ELSE
      ARRAY(SELECT k.key FROM capability_catalogue k WHERE public.new_model_cap(p.user_id, _club_id, k.key) ORDER BY k.key) END,
    ARRAY(SELECT c.capability_key FROM member_capability_overrides c WHERE c.club_member_id = p.id AND c.club_id = _club_id AND c.revoked_at IS NULL AND c.effect = 'grant'),
    ARRAY(SELECT c.capability_key FROM member_capability_overrides c WHERE c.club_member_id = p.id AND c.club_id = _club_id AND c.revoked_at IS NULL AND c.effect = 'deny')
  FROM people p ORDER BY p.name;
END $$;
REVOKE ALL ON FUNCTION public.perm_club_matrix(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.perm_club_matrix(uuid) TO authenticated;