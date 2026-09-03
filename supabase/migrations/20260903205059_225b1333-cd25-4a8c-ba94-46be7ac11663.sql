-- Include product barcode in public QR menu payload
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
      'stock_qty', b.stock_qty, 'active', b.active, 'barcode', b.barcode
    ) INTO v_item
    FROM public.bar_items b WHERE b.id = v_rec.bar_item_id;
  ELSE
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', b.id, 'name', b.name, 'price', b.price,
      'category', b.category, 'image_url', b.image_url,
      'stock_qty', b.stock_qty, 'barcode', b.barcode
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

-- Include product barcode in counter board items
CREATE OR REPLACE FUNCTION public.bar_counter_board(_token uuid DEFAULT NULL, _club_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_club uuid; v_items jsonb; v_tabs jsonb; v_c public.clubs%ROWTYPE;
BEGIN
  v_club := public.bar_counter_context(_token, _club_id);
  SELECT * INTO v_c FROM public.clubs WHERE id = v_club;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'price', i.price, 'category', i.category, 'barcode', i.barcode)
                            ORDER BY i.category NULLS LAST, i.name), '[]'::jsonb)
    INTO v_items FROM public.bar_items i WHERE i.club_id = v_club AND i.active;

  SELECT COALESCE(jsonb_agg(t ORDER BY t->>'opened_at'), '[]'::jsonb) INTO v_tabs
  FROM (
    SELECT jsonb_build_object(
             'tab_id', g.id, 'token', g.token, 'guest_name', g.guest_name,
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

  RETURN jsonb_build_object(
    'club_id', v_club, 'club_name', v_c.name,
    'cash_enabled', COALESCE(v_c.bar_cash_enabled, false),
    'card_enabled', COALESCE(v_c.bar_card_swipe_enabled, true),
    'items', v_items, 'tabs', v_tabs
  );
END; $$;