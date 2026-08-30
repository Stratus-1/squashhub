
ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS bar_account_tab_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS bar_pay_online_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS bar_card_swipe_enabled boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.resolve_qr_short_code(_code text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_rec public.qr_short_codes%ROWTYPE;
  v_club record;
  v_item jsonb;
  v_menu jsonb;
BEGIN
  SELECT * INTO v_rec FROM public.qr_short_codes
  WHERE code = _code AND active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT id, name, logo_url, subdomain, currency_code, honesty_bar_enabled,
         bar_account_tab_enabled, bar_pay_online_enabled, bar_card_swipe_enabled,
         payment_gateway
    INTO v_club FROM public.clubs WHERE id = v_rec.club_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  IF v_rec.bar_item_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'id', b.id, 'name', b.name, 'price', b.price,
      'category', b.category, 'image_url', b.image_url,
      'stock_qty', b.stock_qty, 'active', b.active
    ) INTO v_item
    FROM public.bar_items b WHERE b.id = v_rec.bar_item_id;
  ELSE
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', b.id, 'name', b.name, 'price', b.price,
      'category', b.category, 'image_url', b.image_url,
      'stock_qty', b.stock_qty
    ) ORDER BY b.sort_order NULLS LAST, b.name), '[]'::jsonb)
    INTO v_menu
    FROM public.bar_items b
    WHERE b.club_id = v_rec.club_id AND b.active = true AND COALESCE(b.stock_qty, 0) > 0;
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'kind', v_rec.kind,
    'code', v_rec.code,
    'club', jsonb_build_object(
      'id', v_club.id, 'name', v_club.name, 'logo_url', v_club.logo_url,
      'subdomain', v_club.subdomain, 'currency_code', v_club.currency_code,
      'bar_enabled', COALESCE(v_club.honesty_bar_enabled, false),
      'account_tab_enabled', COALESCE(v_club.bar_account_tab_enabled, true),
      'pay_online_enabled', COALESCE(v_club.bar_pay_online_enabled, true)
        AND lower(COALESCE(v_club.payment_gateway, '')) IN ('stitch','yoco'),
      'card_swipe_enabled', COALESCE(v_club.bar_card_swipe_enabled, true)
    ),
    'item', v_item,
    'menu', v_menu
  );
END;
$fn$;

-- Places a "swipe your card at the bar" order. Works for guests scanning a QR
-- sticker and for signed-in members using the in-app bar.
CREATE OR REPLACE FUNCTION public.record_bar_terminal_sale(
  _lines jsonb,
  _code text DEFAULT NULL,
  _club_id uuid DEFAULT NULL,
  _buyer_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
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
      RAISE EXCEPTION 'Not allowed';
    END IF;
    SELECT id INTO v_member FROM public.club_members
     WHERE club_id = v_club_id AND user_id = auth.uid() LIMIT 1;
    IF v_member IS NULL THEN
      RAISE EXCEPTION 'Not allowed';
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
      'Card machine at the club · awaiting swipe', 'awaiting_terminal', v_member
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
$fn$;

GRANT EXECUTE ON FUNCTION public.record_bar_terminal_sale(jsonb, text, uuid, text) TO anon, authenticated, service_role;
