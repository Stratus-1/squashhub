CREATE OR REPLACE FUNCTION public.resolve_qr_short_code(_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_rec public.qr_short_codes%ROWTYPE; v_club record; v_item jsonb; v_menu jsonb; v_buddies jsonb;
BEGIN
  SELECT * INTO v_rec FROM public.qr_short_codes WHERE code = _code AND active = true;
  IF NOT FOUND THEN RETURN jsonb_build_object('found', false); END IF;
  SELECT id, name, logo_url, subdomain, currency_code, honesty_bar_enabled,
         bar_account_tab_enabled, bar_pay_online_enabled, bar_card_swipe_enabled, bar_cash_enabled, payment_gateway
    INTO v_club FROM public.clubs WHERE id = v_rec.club_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('found', false); END IF;

  IF v_rec.bar_item_id IS NOT NULL THEN
    SELECT jsonb_build_object('id', b.id, 'name', b.name, 'price', b.price, 'category', b.category,
      'division', b.division, 'image_url', b.image_url, 'stock_qty', b.stock_qty,
      'active', public.bar_item_on_menu(b), 'barcode', b.barcode, 'item_kind', b.item_kind,
      'valid_from', b.valid_from, 'valid_to', b.valid_to, 'valid_days', b.valid_days,
      'valid_start_time', b.valid_start_time, 'valid_end_time', b.valid_end_time)
      INTO v_item FROM public.bar_items b WHERE b.id = v_rec.bar_item_id;
  ELSE
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'price', b.price,
      'category', b.category, 'division', b.division, 'image_url', b.image_url,
      'stock_qty', b.stock_qty, 'barcode', b.barcode, 'item_kind', b.item_kind,
      'stock_parent_id', b.stock_parent_id, 'product_group', b.product_group, 'variant_label', b.variant_label,
      'valid_from', b.valid_from, 'valid_to', b.valid_to, 'valid_days', b.valid_days,
      'valid_start_time', b.valid_start_time, 'valid_end_time', b.valid_end_time)
      ORDER BY (b.item_kind = 'special') DESC, b.sort_order NULLS LAST, b.name), '[]'::jsonb)
      INTO v_menu FROM public.bar_items b
     WHERE b.club_id = v_rec.club_id AND public.bar_item_on_menu(b)
       AND (COALESCE(b.stock_qty, 0) > 0 OR b.item_kind IN ('made_to_order', 'special'));
  END IF;

  -- Mixer ("buddy") choices for spirit + mixer orders: active, in-stock soft-drink
  -- items even when not sellable on the menu (e.g. bulk mixers like Coke Bulk).
  -- Word-boundary match so "Chocolates" never counts as "cola"; premixed
  -- "X and Cola" / "X plus Y" drinks are not mixers and are excluded.
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'price', b.price,
    'category', b.category, 'division', b.division, 'image_url', b.image_url,
    'stock_qty', b.stock_qty, 'item_kind', b.item_kind)
    ORDER BY b.price, b.name), '[]'::jsonb)
    INTO v_buddies FROM public.bar_items b
   WHERE b.club_id = v_rec.club_id AND b.active AND b.archived_at IS NULL
     AND b.item_kind <> 'special'
     AND b.name ~* '\m(buddy|coke|cola|soda|tonic|mixer)\M'
     AND b.name !~* '\m(and|plus)\M'
     AND (COALESCE(b.stock_qty, 0) > 0 OR b.item_kind = 'made_to_order');

  RETURN jsonb_build_object('found', true, 'kind', v_rec.kind, 'code', v_rec.code,
    'club', jsonb_build_object('id', v_club.id, 'name', v_club.name, 'logo_url', v_club.logo_url,
      'subdomain', v_club.subdomain, 'currency_code', v_club.currency_code,
      'bar_enabled', COALESCE(v_club.honesty_bar_enabled, false),
      'account_tab_enabled', COALESCE(v_club.bar_account_tab_enabled, true),
      'pay_online_enabled', COALESCE(v_club.bar_pay_online_enabled, true)
        AND lower(COALESCE(v_club.payment_gateway, '')) IN ('stitch','yoco','payfast'),
      'card_swipe_enabled', COALESCE(v_club.bar_card_swipe_enabled, true),
      'cash_enabled', COALESCE(v_club.bar_cash_enabled, false)),
    'item', v_item, 'menu', v_menu, 'buddies', v_buddies);
END; $function$