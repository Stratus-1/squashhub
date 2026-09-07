-- Member account bar charges are approved with a one-time code (WhatsApp/SMS),
-- no longer with a stored Bar PIN.

CREATE OR REPLACE FUNCTION public.bar_qr_charge_guest_tab_member(
  _tab_id uuid,
  _token uuid,
  _club_member_id uuid,
  _pin text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_tab public.bar_guest_tabs%ROWTYPE;
  v_member public.club_members%ROWTYPE;
  v_otp public.member_bar_otps%ROWTYPE;
  v_sale public.bar_visitor_sales%ROWTYPE;
  v_total numeric := 0;
  v_first uuid;
  v_entry_id uuid;
BEGIN
  SELECT * INTO v_tab FROM public.bar_guest_tabs
   WHERE id = _tab_id AND token = _token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tab not found'; END IF;
  IF v_tab.status <> 'open' THEN RAISE EXCEPTION 'This tab has already been settled'; END IF;

  SELECT * INTO v_member FROM public.club_members
   WHERE id = _club_member_id AND club_id = v_tab.club_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF COALESCE(v_member.status, 'active') <> 'active' THEN RAISE EXCEPTION 'This membership is not active'; END IF;
  IF COALESCE(v_member.role::text, 'member') = 'visitor' THEN RAISE EXCEPTION 'Visitors cannot charge to an account'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clubs
     WHERE id = v_tab.club_id
       AND COALESCE(honesty_bar_enabled, false)
       AND COALESCE(bar_account_tab_enabled, true)
  ) THEN
    RAISE EXCEPTION 'Member account charges are not enabled for this club';
  END IF;

  SELECT * INTO v_otp FROM public.member_bar_otps
   WHERE club_member_id = _club_member_id AND consumed_at IS NULL AND expires_at > now()
   ORDER BY created_at DESC LIMIT 1
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Please send the member a new verification code'; END IF;
  IF v_otp.attempts >= 5 THEN RAISE EXCEPTION 'Too many attempts — please send a new code'; END IF;
  IF COALESCE(_pin, '') !~ '^[0-9]{6}$' OR v_otp.code_hash <> crypt(_pin, v_otp.code_hash) THEN
    UPDATE public.member_bar_otps SET attempts = attempts + 1 WHERE id = v_otp.id;
    RAISE EXCEPTION 'That verification code is not valid';
  END IF;
  UPDATE public.member_bar_otps SET consumed_at = now() WHERE id = v_otp.id;

  IF NOT EXISTS (
    SELECT 1 FROM public.bar_visitor_sales
     WHERE guest_tab_id = _tab_id AND payment_status = 'on_tab'
  ) THEN
    RAISE EXCEPTION 'This tab has no items to charge';
  END IF;

  FOR v_sale IN
    SELECT * FROM public.bar_visitor_sales
     WHERE guest_tab_id = _tab_id AND payment_status = 'on_tab'
     ORDER BY created_at, id
     FOR UPDATE
  LOOP
    UPDATE public.bar_items
       SET stock_qty = stock_qty + v_sale.quantity, updated_at = now()
     WHERE id = v_sale.bar_item_id AND club_id = v_tab.club_id;

    DELETE FROM public.bar_visitor_sales WHERE id = v_sale.id;

    INSERT INTO public.bar_tab_entries (
      club_id, club_member_id, bar_item_id, quantity, unit_price, total,
      logged_by, source, verification_method, verified_at
    ) VALUES (
      v_tab.club_id, _club_member_id, v_sale.bar_item_id, v_sale.quantity,
      v_sale.unit_price, v_sale.total, _club_member_id, 'qr', 'otp', now()
    ) RETURNING id INTO v_entry_id;

    v_first := COALESCE(v_first, v_entry_id);
    v_total := v_total + v_sale.total;
  END LOOP;

  UPDATE public.bar_guest_tabs
     SET status = 'settled', closed_at = now(), settled_method = 'member_account',
         club_member_id = _club_member_id
   WHERE id = _tab_id;

  RETURN jsonb_build_object(
    'ok', true, 'entry_id', v_first, 'total', v_total,
    'member_name', v_member.name, 'verification', 'otp'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.bar_qr_charge_member(
  _club_id uuid,
  _club_member_id uuid,
  _lines jsonb,
  _pin text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_member public.club_members%ROWTYPE;
  v_otp public.member_bar_otps%ROWTYPE;
  v_line jsonb; v_item public.bar_items%ROWTYPE; v_qty int;
  v_total numeric := 0; v_first uuid; v_id uuid;
BEGIN
  SELECT * INTO v_member FROM public.club_members
   WHERE id = _club_member_id AND club_id = _club_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF COALESCE(v_member.status, 'active') <> 'active' THEN RAISE EXCEPTION 'This membership is not active'; END IF;
  IF COALESCE(v_member.role::text, 'member') = 'visitor' THEN RAISE EXCEPTION 'Visitors cannot charge to an account'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clubs WHERE id = _club_id AND COALESCE(honesty_bar_enabled, false)) THEN
    RAISE EXCEPTION 'The bar is not enabled for this club';
  END IF;

  SELECT * INTO v_otp FROM public.member_bar_otps
   WHERE club_member_id = _club_member_id AND consumed_at IS NULL AND expires_at > now()
   ORDER BY created_at DESC LIMIT 1
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Please send the member a new verification code'; END IF;
  IF v_otp.attempts >= 5 THEN RAISE EXCEPTION 'Too many attempts — please send a new code'; END IF;
  IF COALESCE(_pin, '') !~ '^[0-9]{6}$' OR v_otp.code_hash <> crypt(_pin, v_otp.code_hash) THEN
    UPDATE public.member_bar_otps SET attempts = attempts + 1 WHERE id = v_otp.id;
    RAISE EXCEPTION 'That verification code is not valid';
  END IF;
  UPDATE public.member_bar_otps SET consumed_at = now() WHERE id = v_otp.id;

  IF _lines IS NULL OR jsonb_array_length(_lines) = 0 OR jsonb_array_length(_lines) > 30 THEN
    RAISE EXCEPTION 'Nothing to charge';
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(_lines) LOOP
    v_qty := COALESCE((v_line->>'quantity')::int, 0);
    IF v_qty < 1 OR v_qty > 50 THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
    SELECT * INTO v_item FROM public.bar_items
     WHERE id = (v_line->>'bar_item_id')::uuid AND club_id = _club_id AND active = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'One or more items are not available'; END IF;

    INSERT INTO public.bar_tab_entries (
      club_id, club_member_id, bar_item_id, quantity, unit_price, total,
      logged_by, source, verification_method, verified_at
    ) VALUES (
      _club_id, _club_member_id, v_item.id, v_qty, v_item.price, v_item.price * v_qty,
      _club_member_id, 'qr', 'otp', now()
    ) RETURNING id INTO v_id;

    v_first := COALESCE(v_first, v_id);
    v_total := v_total + v_item.price * v_qty;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'entry_id', v_first, 'total', v_total, 'member_name', v_member.name);
END;
$$;
