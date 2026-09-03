-- Self-service (QR) member identification: membership number -> shortened name only.
CREATE OR REPLACE FUNCTION public.bar_qr_lookup_member(_club_id uuid, _number text)
RETURNS TABLE (id uuid, display_name text, has_pin boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_raw text := upper(regexp_replace(coalesce(_number, ''), '\s', '', 'g'));
  v_digits text := regexp_replace(coalesce(_number, ''), '\D', '', 'g');
  v_m public.club_members%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.clubs c WHERE c.id = _club_id AND COALESCE(c.honesty_bar_enabled, false)) THEN
    RAISE EXCEPTION 'The bar is not enabled for this club';
  END IF;
  IF length(v_raw) < 1 THEN RETURN; END IF;

  IF v_raw ~ '^[0-9]+$' THEN
    SELECT * INTO v_m FROM public.club_members cm
     WHERE cm.club_id = _club_id AND cm.status = 'active'
       AND COALESCE(cm.role::text, 'member') <> 'visitor'
       AND regexp_replace(coalesce(cm.club_member_number, ''), '\D', '', 'g') <> ''
       AND (regexp_replace(cm.club_member_number, '\D', '', 'g'))::bigint = v_digits::bigint
     ORDER BY cm.club_member_number LIMIT 1;
  ELSE
    IF length(v_raw) < 3 THEN RETURN; END IF;
    SELECT * INTO v_m FROM public.club_members cm
     WHERE cm.club_id = _club_id AND cm.status = 'active'
       AND COALESCE(cm.role::text, 'member') <> 'visitor'
       AND upper(regexp_replace(coalesce(cm.club_member_number, ''), '\s', '', 'g')) = v_raw
     LIMIT 1;
  END IF;

  IF v_m.id IS NULL THEN RETURN; END IF;

  RETURN QUERY SELECT
    v_m.id,
    (split_part(btrim(v_m.name), ' ', 1) ||
     CASE WHEN position(' ' IN btrim(v_m.name)) > 0
          THEN ' ' || upper(substr(split_part(btrim(v_m.name), ' ', array_length(string_to_array(btrim(v_m.name), ' '), 1)), 1, 1)) || '.'
          ELSE '' END)::text,
    EXISTS (SELECT 1 FROM public.member_bar_pins p WHERE p.club_member_id = v_m.id);
END;
$$;

-- Charge the QR basket to a member account, authorised by that member's own Bar PIN.
CREATE OR REPLACE FUNCTION public.bar_qr_charge_member(
  _club_id uuid,
  _club_member_id uuid,
  _lines jsonb,
  _pin text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_member public.club_members%ROWTYPE;
  v_pin public.member_bar_pins%ROWTYPE;
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

  SELECT * INTO v_pin FROM public.member_bar_pins WHERE club_member_id = _club_member_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No Bar PIN has been set up yet — set one in Settings first'; END IF;
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
  UPDATE public.member_bar_pins SET failed_attempts = 0, locked_until = NULL, updated_at = now()
   WHERE club_member_id = _club_member_id;

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
      _club_member_id, 'qr', 'pin', now()
    ) RETURNING id INTO v_id;

    v_first := COALESCE(v_first, v_id);
    v_total := v_total + v_item.price * v_qty;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'entry_id', v_first, 'total', v_total, 'member_name', v_member.name);
END;
$$;

REVOKE ALL ON FUNCTION public.bar_qr_lookup_member(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bar_qr_charge_member(uuid, uuid, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bar_qr_lookup_member(uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bar_qr_charge_member(uuid, uuid, jsonb, text) TO anon, authenticated, service_role;