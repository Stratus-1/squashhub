CREATE OR REPLACE FUNCTION public.bar_counter_open_tab(_guest_name text, _token uuid DEFAULT NULL::uuid, _club_id uuid DEFAULT NULL::uuid, _guest_phone text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_club uuid; v_id uuid; v_dev uuid;
BEGIN
  v_club := public.bar_counter_context(_token, _club_id);
  IF btrim(COALESCE(_guest_name,'')) = '' THEN RAISE EXCEPTION 'Please give a name for the tab'; END IF;
  v_dev := public.bar_counter_device_for_token(_token);
  INSERT INTO public.bar_guest_tabs (club_id, guest_name, guest_phone, counter_device_id)
  VALUES (v_club, left(btrim(_guest_name), 80), NULLIF(left(btrim(COALESCE(_guest_phone,'')), 30), ''), v_dev) RETURNING id INTO v_id;
  RETURN jsonb_build_object('tab_id', v_id);
END; $function$;

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
           'stock_qty', i.stock_qty)
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
             'total', COALESCE((SELECT sum(s.total) FROM public.bar_visitor_sales s WHERE s.guest_tab_id = g.id), 0),
             'lines', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', b.name, 'quantity', s.quantity, 'total', s.total)
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
    'venue_code', v_code,
    'items', v_items, 'tabs', v_tabs);
END; $function$;