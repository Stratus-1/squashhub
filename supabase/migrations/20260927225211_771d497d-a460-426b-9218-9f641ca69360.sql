CREATE OR REPLACE FUNCTION public.bar_consume_sale()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE it public.bar_items%ROWTYPE; r record; v_neg boolean;
BEGIN
  SELECT * INTO it FROM public.bar_items WHERE id = NEW.bar_item_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF it.item_kind = 'made_to_order' THEN RETURN NEW; END IF;
  v_neg := public.bar_allow_negative_stock(it.club_id);

  IF it.item_kind = 'special' THEN
    IF NOT public.bar_item_valid_now(it) THEN RAISE EXCEPTION '% is not available right now', it.name; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.bar_special_components WHERE special_item_id = it.id) THEN
      RAISE EXCEPTION '% has no components set up', it.name;
    END IF;
    FOR r IN
      SELECT COALESCE(ci.stock_parent_id, ci.id) AS root,
             sum(c.quantity * public.bar_units_per_sale(ci)) * NEW.quantity AS units
        FROM public.bar_special_components c JOIN public.bar_items ci ON ci.id = c.component_item_id
       WHERE c.special_item_id = it.id GROUP BY 1
    LOOP
      PERFORM 1 FROM public.bar_items WHERE id = r.root AND (v_neg OR stock_units >= r.units) FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Not enough stock for %', it.name; END IF;
    END LOOP;
    IF v_neg THEN PERFORM set_config('sh.bar_allow_negative', '1', true); END IF;
    FOR r IN
      SELECT COALESCE(ci.stock_parent_id, ci.id) AS root,
             sum(c.quantity * public.bar_units_per_sale(ci)) * NEW.quantity AS units
        FROM public.bar_special_components c JOIN public.bar_items ci ON ci.id = c.component_item_id
       WHERE c.special_item_id = it.id GROUP BY 1
    LOOP
      PERFORM public.bar_stock_apply(r.root, -r.units::int, 'special_sale', TG_TABLE_NAME, NEW.id, it.id, false);
    END LOOP;
    PERFORM set_config('sh.bar_allow_negative', '', true);
  ELSE
    IF v_neg THEN PERFORM set_config('sh.bar_allow_negative', '1', true); END IF;
    PERFORM public.bar_stock_apply(COALESCE(it.stock_parent_id, it.id),
                                   -(NEW.quantity * public.bar_units_per_sale(it)),
                                   'sale', TG_TABLE_NAME, NEW.id, it.id, false);
    PERFORM set_config('sh.bar_allow_negative', '', true);
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.resolve_qr_short_code(_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_rec public.qr_short_codes%ROWTYPE; v_club record; v_item jsonb; v_menu jsonb;
BEGIN
  SELECT * INTO v_rec FROM public.qr_short_codes WHERE code = _code AND active = true;
  IF NOT FOUND THEN RETURN jsonb_build_object('found', false); END IF;
  SELECT id, name, logo_url, subdomain, currency_code, honesty_bar_enabled,
         bar_account_tab_enabled, bar_pay_online_enabled, bar_card_swipe_enabled, payment_gateway
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
       AND (COALESCE(b.stock_qty, 0) > 0 OR b.item_kind = 'made_to_order');
  END IF;

  RETURN jsonb_build_object('found', true, 'kind', v_rec.kind, 'code', v_rec.code,
    'club', jsonb_build_object('id', v_club.id, 'name', v_club.name, 'logo_url', v_club.logo_url,
      'subdomain', v_club.subdomain, 'currency_code', v_club.currency_code,
      'bar_enabled', COALESCE(v_club.honesty_bar_enabled, false),
      'account_tab_enabled', COALESCE(v_club.bar_account_tab_enabled, true),
      'pay_online_enabled', COALESCE(v_club.bar_pay_online_enabled, true)
        AND lower(COALESCE(v_club.payment_gateway, '')) IN ('stitch','yoco'),
      'card_swipe_enabled', COALESCE(v_club.bar_card_swipe_enabled, true)),
    'item', v_item, 'menu', v_menu);
END; $function$;