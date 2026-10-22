CREATE OR REPLACE FUNCTION public.bar_counter_remove_tab_item(_sale_id uuid, _reason text, _token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_club uuid; v_dev uuid; v_name text; v_sale public.bar_visitor_sales; v_tab public.bar_guest_tabs; v_item text; m record;
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
  SELECT * INTO v_tab FROM public.bar_guest_tabs WHERE id = v_sale.guest_tab_id AND club_id = v_club FOR UPDATE;
  IF NOT FOUND OR v_tab.status <> 'open' THEN RAISE EXCEPTION 'Items can only be removed while the tab is open'; END IF;
  IF v_sale.payment_status <> 'on_tab' THEN RAISE EXCEPTION 'This item has already been paid'; END IF;
  IF EXISTS (SELECT 1 FROM public.bar_tips WHERE sale_id = _sale_id) THEN RAISE EXCEPTION 'This item has a tip attached and cannot be removed'; END IF;

  SELECT name INTO v_item FROM public.bar_items WHERE id = v_sale.bar_item_id;

  -- Put the stock back exactly as it was taken.
  FOR m IN SELECT bar_item_id, units_delta FROM public.bar_stock_movements
            WHERE source_table = 'bar_visitor_sales' AND source_id = _sale_id AND reason IN ('sale','special_sale') LOOP
    PERFORM set_config('sh.bar_allow_negative', '1', true);
    PERFORM public.bar_stock_apply(m.bar_item_id, -m.units_delta, 'sale', 'bar_visitor_sales', _sale_id, v_sale.bar_item_id, false);
    PERFORM set_config('sh.bar_allow_negative', '', true);
  END LOOP;
  UPDATE public.bar_stock_movements SET note = 'Removed from tab by ' || v_name || ': ' || btrim(_reason)
   WHERE source_table = 'bar_visitor_sales' AND source_id = _sale_id AND units_delta > 0 AND note IS NULL;

  INSERT INTO public.bar_tab_payment_events (club_id, tab_id, action, method, amount, reason, actor_user_id, actor_device_id)
  VALUES (v_club, v_tab.id, 'item_removed', NULL, v_sale.total,
          v_sale.quantity || ' x ' || coalesce(v_item,'item') || ' removed by ' || v_name || ': ' || btrim(_reason), auth.uid(), v_dev);

  DELETE FROM public.bar_visitor_sales WHERE id = _sale_id;
  RETURN public.get_bar_guest_tab(v_tab.id, v_tab.token);
END $function$;

REVOKE ALL ON FUNCTION public.bar_counter_remove_tab_item(uuid, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.bar_counter_remove_tab_item(uuid, text, uuid) TO anon, authenticated;