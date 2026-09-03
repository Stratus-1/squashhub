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
  v_pin public.member_bar_pins%ROWTYPE;
  v_sale public.bar_visitor_sales%ROWTYPE;
  v_total numeric := 0;
  v_first uuid;
  v_entry_id uuid;
BEGIN
  SELECT * INTO v_tab
    FROM public.bar_guest_tabs
   WHERE id = _tab_id AND token = _token
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tab not found'; END IF;
  IF v_tab.status <> 'open' THEN RAISE EXCEPTION 'This tab has already been settled'; END IF;

  SELECT * INTO v_member
    FROM public.club_members
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

  SELECT * INTO v_pin
    FROM public.member_bar_pins
   WHERE club_member_id = _club_member_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No Bar PIN has been set up yet — set one in Bar / POS first'; END IF;
  IF v_pin.locked_until IS NOT NULL AND v_pin.locked_until > now() THEN
    RAISE EXCEPTION 'This Bar PIN is temporarily locked — please try again later';
  END IF;
  IF COALESCE(_pin, '') !~ '^[0-9]{6}$' OR v_pin.pin_hash <> crypt(_pin, v_pin.pin_hash) THEN
    UPDATE public.member_bar_pins
       SET failed_attempts = failed_attempts + 1,
           locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN now() + interval '15 minutes' ELSE locked_until END,
           updated_at = now()
     WHERE club_member_id = _club_member_id;
    RAISE EXCEPTION 'That Bar PIN is not correct';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.bar_visitor_sales
     WHERE guest_tab_id = _tab_id AND payment_status = 'on_tab'
  ) THEN
    RAISE EXCEPTION 'This tab has no items to charge';
  END IF;

  UPDATE public.member_bar_pins
     SET failed_attempts = 0, locked_until = NULL, updated_at = now()
   WHERE club_member_id = _club_member_id;

  FOR v_sale IN
    SELECT * FROM public.bar_visitor_sales
     WHERE guest_tab_id = _tab_id AND payment_status = 'on_tab'
     ORDER BY created_at, id
     FOR UPDATE
  LOOP
    UPDATE public.bar_items
       SET stock_qty = stock_qty + v_sale.quantity,
           updated_at = now()
     WHERE id = v_sale.bar_item_id AND club_id = v_tab.club_id;

    DELETE FROM public.bar_visitor_sales WHERE id = v_sale.id;

    INSERT INTO public.bar_tab_entries (
      club_id, club_member_id, bar_item_id, quantity, unit_price, total,
      logged_by, source, verification_method, verified_at
    ) VALUES (
      v_tab.club_id, _club_member_id, v_sale.bar_item_id, v_sale.quantity,
      v_sale.unit_price, v_sale.total, _club_member_id, 'qr', 'pin', now()
    ) RETURNING id INTO v_entry_id;

    v_first := COALESCE(v_first, v_entry_id);
    v_total := v_total + v_sale.total;
  END LOOP;

  UPDATE public.bar_guest_tabs
     SET status = 'settled', closed_at = now(), settled_method = 'member_account',
         club_member_id = _club_member_id
   WHERE id = _tab_id;

  RETURN jsonb_build_object(
    'ok', true,
    'entry_id', v_first,
    'total', v_total,
    'member_name', v_member.name,
    'verification', 'pin'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bar_qr_charge_guest_tab_member(uuid, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bar_qr_charge_guest_tab_member(uuid, uuid, uuid, text) TO anon, authenticated, service_role;