CREATE OR REPLACE FUNCTION public.record_bar_terminal_sale(
  _lines jsonb, _code text DEFAULT NULL, _club_id uuid DEFAULT NULL, _buyer_name text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_club_id uuid;
  v_line jsonb;
  v_item public.bar_items%ROWTYPE;
  v_qty int;
  v_total numeric := 0;
  v_first uuid;
  v_id uuid;
  v_member uuid;
BEGIN
  IF _code IS NOT NULL THEN
    SELECT club_id INTO v_club_id FROM public.qr_short_codes WHERE code = _code AND active = true;
  ELSE
    v_club_id := _club_id;
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Please sign in to place this order';
    END IF;
    SELECT id INTO v_member FROM public.club_members
     WHERE club_id = v_club_id AND user_id = auth.uid() LIMIT 1;
    IF v_member IS NULL AND NOT public.is_club_member(auth.uid(), v_club_id) THEN
      RAISE EXCEPTION 'You are not a member of this club';
    END IF;
  END IF;

  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'This bar code is no longer active';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clubs
     WHERE id = v_club_id
       AND COALESCE(honesty_bar_enabled, false)
       AND COALESCE(bar_card_swipe_enabled, true)
  ) THEN
    RAISE EXCEPTION 'Card machine payments are not available at this club';
  END IF;

  IF _lines IS NULL OR jsonb_array_length(_lines) = 0 OR jsonb_array_length(_lines) > 30 THEN
    RAISE EXCEPTION 'Nothing to pay for';
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(_lines) LOOP
    v_qty := COALESCE((v_line->>'quantity')::int, 0);
    IF v_qty < 1 OR v_qty > 50 THEN
      RAISE EXCEPTION 'Invalid quantity';
    END IF;
    SELECT * INTO v_item FROM public.bar_items
     WHERE id = (v_line->>'bar_item_id')::uuid AND club_id = v_club_id AND active = true;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'One or more items are not available';
    END IF;

    INSERT INTO public.bar_visitor_sales (
      club_id, bar_item_id, quantity, unit_price, total,
      payment_method, visitor_name, note, payment_status, logged_by
    ) VALUES (
      v_club_id, v_item.id, v_qty, v_item.price, v_item.price * v_qty,
      'card', NULLIF(btrim(COALESCE(_buyer_name, '')), ''),
      'Card machine at the club · customer confirmed swipe', 'paid', v_member
    ) RETURNING id INTO v_id;

    v_first := COALESCE(v_first, v_id);
    v_total := v_total + v_item.price * v_qty;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'sale_id', v_first,
    'reference', 'BAR-' || upper(substr(v_first::text, 1, 8)),
    'total', v_total
  );
END;
$$;