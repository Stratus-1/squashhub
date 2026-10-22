CREATE OR REPLACE FUNCTION public.bar_consume_sale()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE it public.bar_items%ROWTYPE; r record; v_neg boolean;
BEGIN
  -- Tab reversal lines (negative total) return stock in bar_counter_remove_tab_item, never here.
  IF NEW.total < 0 THEN RETURN NEW; END IF;
  SELECT * INTO it FROM public.bar_items WHERE id = NEW.bar_item_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF it.item_kind = 'made_to_order' THEN RETURN NEW; END IF;
  v_neg := COALESCE(it.allow_negative_stock, public.bar_allow_negative_stock(it.club_id));

  IF it.item_kind = 'special' THEN
    IF NOT public.bar_item_valid_now(it) THEN RAISE EXCEPTION '% is not available right now', it.name; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.bar_special_components WHERE special_item_id = it.id) THEN
      RAISE EXCEPTION '% has no components set up', it.name;
    END IF;
    FOR r IN
      SELECT ri.id AS root,
             sum(c.quantity * public.bar_units_per_sale(ci)) * NEW.quantity AS units,
             bool_or(COALESCE(ri.allow_negative_stock, ci.allow_negative_stock, v_neg)) AS neg
        FROM public.bar_special_components c
        JOIN public.bar_items ci ON ci.id = c.component_item_id
        JOIN public.bar_items ri ON ri.id = COALESCE(ci.stock_parent_id, ci.id)
       WHERE c.special_item_id = it.id GROUP BY 1
    LOOP
      PERFORM 1 FROM public.bar_items WHERE id = r.root AND (r.neg OR stock_units >= r.units) FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Not enough stock for %', it.name; END IF;
    END LOOP;
    FOR r IN
      SELECT ri.id AS root,
             sum(c.quantity * public.bar_units_per_sale(ci)) * NEW.quantity AS units,
             bool_or(COALESCE(ri.allow_negative_stock, ci.allow_negative_stock, v_neg)) AS neg
        FROM public.bar_special_components c
        JOIN public.bar_items ci ON ci.id = c.component_item_id
        JOIN public.bar_items ri ON ri.id = COALESCE(ci.stock_parent_id, ci.id)
       WHERE c.special_item_id = it.id GROUP BY 1
    LOOP
      IF r.neg THEN PERFORM set_config('sh.bar_allow_negative', '1', true); END IF;
      PERFORM public.bar_stock_apply(r.root, -r.units::int, 'special_sale', TG_TABLE_NAME, NEW.id, it.id, false);
      PERFORM set_config('sh.bar_allow_negative', '', true);
    END LOOP;
  ELSE
    SELECT COALESCE(p.allow_negative_stock, v_neg) INTO v_neg
      FROM public.bar_items p WHERE p.id = COALESCE(it.stock_parent_id, it.id);
    IF v_neg THEN PERFORM set_config('sh.bar_allow_negative', '1', true); END IF;
    PERFORM public.bar_stock_apply(COALESCE(it.stock_parent_id, it.id),
                                   -(NEW.quantity * public.bar_units_per_sale(it)),
                                   'sale', TG_TABLE_NAME, NEW.id, it.id, false);
    PERFORM set_config('sh.bar_allow_negative', '', true);
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.bar_counter_board(_token uuid DEFAULT NULL::uuid, _club_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_club uuid; v_items jsonb; v_tabs jsonb; v_c public.clubs%ROWTYPE; v_code text;
BEGIN
  v_club := public.bar_counter_context(_token, _club_id);
  SELECT * INTO v_c FROM public.clubs WHERE id = v_club;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'price', i.price, 'category', i.category,
           'barcode', i.barcode, 'image_url', i.image_url, 'division', i.division, 'item_kind', i.item_kind,
           'stock_qty', i.stock_qty,
           'avg_unit_cost', i.avg_unit_cost, 'cost_price', i.cost_price, 'unit_yield', i.unit_yield)
         ORDER BY (i.item_kind = 'special') DESC, i.category NULLS LAST, i.name), '[]'::jsonb)
    INTO v_items FROM public.bar_items i
   WHERE i.club_id = v_club AND public.bar_item_on_menu(i)
     AND (i.item_kind <> 'special' OR i.stock_qty > 0);

  SELECT COALESCE(jsonb_agg(t ORDER BY t->>'opened_at'), '[]'::jsonb) INTO v_tabs
  FROM (
    SELECT jsonb_build_object(
             'tab_id', g.id, 'token', g.token, 'guest_name', g.guest_name,
             'phone', COALESCE(NULLIF(g.guest_phone, ''), (SELECT NULLIF(m.phone, '') FROM public.club_members m WHERE m.id = g.club_member_id)),
             'status', g.status, 'opened_at', g.opened_at,
             'operator', g.operator_name, 'opened_source', g.opened_source,
             'settled_method', g.settled_method,
             'club_member_id', g.club_member_id,
             'subtotal', COALESCE((SELECT sum(s.total) FROM public.bar_visitor_sales s WHERE s.guest_tab_id = g.id), 0), 'tip', coalesce((SELECT amount FROM public.bar_tips WHERE tab_id=g.id AND status<>'cancelled'),0), 'total', COALESCE((SELECT sum(s.total) FROM public.bar_visitor_sales s WHERE s.guest_tab_id = g.id), 0)+coalesce((SELECT amount FROM public.bar_tips WHERE tab_id=g.id AND status<>'cancelled'),0),
             'lines', COALESCE((SELECT jsonb_agg(jsonb_build_object('sale_id', s.id, 'paid', s.payment_status <> 'on_tab', 'is_reversal', s.total < 0, 'reversed', EXISTS (SELECT 1 FROM public.bar_visitor_sales r WHERE r.guest_tab_id = s.guest_tab_id AND r.note = 'Reversal of ' || s.id::text), 'name', b.name, 'quantity', s.quantity, 'total', s.total)
                                                 ORDER BY s.created_at)
                                  FROM public.bar_visitor_sales s
                                  LEFT JOIN public.bar_items b ON b.id = s.bar_item_id
                                 WHERE s.guest_tab_id = g.id), '[]'::jsonb)
           ) AS t
      FROM public.bar_guest_tabs g
     WHERE g.club_id = v_club AND g.status IN ('open','closing')
  ) q;

  SELECT code INTO v_code FROM public.qr_short_codes
   WHERE club_id = v_club AND active AND bar_item_id IS NULL LIMIT 1;

  RETURN jsonb_build_object('club_id', v_club, 'club_name', v_c.name,
    'cash_enabled', COALESCE(v_c.bar_cash_enabled, false),
    'card_enabled', COALESCE(v_c.bar_card_swipe_enabled, true),
    'account_enabled', COALESCE(v_c.bar_account_tab_enabled, true),
    'online_enabled', COALESCE(v_c.bar_pay_online_enabled, true),
    'payment_gateway', lower(COALESCE(v_c.payment_gateway, '')),
    'venue_code', v_code, 'tip_staff_id', (SELECT device_id FROM public.bar_counter_sessions WHERE token=_token AND revoked_at IS NULL AND expires_at>now() AND club_id=v_club),
    'items', v_items, 'tabs', v_tabs);
END; $function$;

CREATE OR REPLACE FUNCTION public.bar_counter_remove_tab_item(_sale_id uuid, _reason text, _token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_club uuid; v_dev uuid; v_name text; v_sale public.bar_visitor_sales; v_tab public.bar_guest_tabs; v_item text; v_rev uuid; m record;
BEGIN
  IF _token IS NULL THEN RAISE EXCEPTION 'Unlock counter with your personal PIN again'; END IF;
  v_club := public.bar_counter_context(_token, NULL);
  SELECT d.id, d.label INTO v_dev, v_name FROM public.bar_counter_sessions s
    JOIN public.bar_counter_devices d ON d.id = s.device_id AND d.club_id = s.club_id
   WHERE s.token = _token AND s.club_id = v_club AND s.revoked_at IS NULL AND s.expires_at > now() AND d.active;
  IF v_dev IS NULL OR nullif(btrim(v_name),'') IS NULL THEN RAISE EXCEPTION 'Unlock counter with your personal PIN again'; END IF;
  IF nullif(btrim(coalesce(_reason,'')),'') IS NULL THEN RAISE EXCEPTION 'Please give a reason'; END IF;

  SELECT * INTO v_sale FROM public.bar_visitor_sales WHERE id = _sale_id AND club_id = v_club FOR UPDATE;
  IF NOT FOUND OR v_sale.guest_tab_id IS NULL THEN RAISE EXCEPTION 'Item not found on a tab'; END IF;
  IF v_sale.total < 0 THEN RAISE EXCEPTION 'A reversal line cannot be reversed'; END IF;
  SELECT * INTO v_tab FROM public.bar_guest_tabs WHERE id = v_sale.guest_tab_id AND club_id = v_club FOR UPDATE;
  IF NOT FOUND OR v_tab.status <> 'open' THEN RAISE EXCEPTION 'Items can only be removed while the tab is open'; END IF;
  IF v_sale.payment_status <> 'on_tab' THEN RAISE EXCEPTION 'This item has already been paid'; END IF;
  IF EXISTS (SELECT 1 FROM public.bar_visitor_sales WHERE guest_tab_id = v_tab.id AND note = 'Reversal of ' || _sale_id::text) THEN
    RAISE EXCEPTION 'This item has already been removed';
  END IF;

  SELECT name INTO v_item FROM public.bar_items WHERE id = v_sale.bar_item_id;

  INSERT INTO public.bar_visitor_sales(club_id,bar_item_id,quantity,unit_price,total,payment_method,visitor_name,note,payment_status,guest_tab_id,counter_device_id,counter_operator_name)
  VALUES (v_club, v_sale.bar_item_id, v_sale.quantity, -v_sale.unit_price, -v_sale.total, 'tab', v_sale.visitor_name,
          'Reversal of ' || _sale_id::text, 'on_tab', v_tab.id, v_dev, v_name)
  RETURNING id INTO v_rev;

  FOR m IN SELECT bar_item_id, units_delta FROM public.bar_stock_movements
            WHERE source_table = 'bar_visitor_sales' AND source_id = _sale_id AND reason IN ('sale','special_sale') AND units_delta < 0 LOOP
    PERFORM set_config('sh.bar_allow_negative', '1', true);
    PERFORM public.bar_stock_apply(m.bar_item_id, -m.units_delta, 'sale', 'bar_visitor_sales', v_rev, v_sale.bar_item_id, false);
    PERFORM set_config('sh.bar_allow_negative', '', true);
  END LOOP;
  UPDATE public.bar_stock_movements SET note = 'Removed from tab by ' || v_name || ': ' || btrim(_reason)
   WHERE source_table = 'bar_visitor_sales' AND source_id = v_rev;

  INSERT INTO public.bar_tab_payment_events (club_id, tab_id, action, method, amount, reason, actor_user_id, actor_device_id)
  VALUES (v_club, v_tab.id, 'item_removed', NULL, -v_sale.total,
          v_sale.quantity || ' x ' || coalesce(v_item,'item') || ' removed by ' || v_name || ': ' || btrim(_reason), auth.uid(), v_dev);

  RETURN public.get_bar_guest_tab(v_tab.id, v_tab.token);
END $function$;