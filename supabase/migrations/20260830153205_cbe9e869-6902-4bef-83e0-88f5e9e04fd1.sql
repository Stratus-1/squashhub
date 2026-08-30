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
         bar_cash_enabled, payment_gateway
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
      'card_swipe_enabled', COALESCE(v_club.bar_card_swipe_enabled, true),
      'cash_enabled', COALESCE(v_club.bar_cash_enabled, false)
    ),
    'item', v_item,
    'menu', v_menu
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.resolve_qr_short_code(text) TO anon, authenticated, service_role;