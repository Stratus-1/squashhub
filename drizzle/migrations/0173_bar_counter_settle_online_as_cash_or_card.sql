CREATE OR REPLACE FUNCTION public.bar_counter_settle_tab(_tab_id uuid, _method text, _token uuid DEFAULT NULL::uuid, _club_id uuid DEFAULT NULL::uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_club uuid; v_tab public.bar_guest_tabs%ROWTYPE; v_total numeric; v_dev uuid; v_ref text;
BEGIN
  v_club := public.bar_counter_context(_token, _club_id);
  IF _token IS NULL AND auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to confirm payments'; END IF;
  IF _method NOT IN ('terminal','cash') THEN RAISE EXCEPTION 'Unknown payment method'; END IF;
  SELECT * INTO v_tab FROM public.bar_guest_tabs WHERE id = _tab_id AND club_id = v_club FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tab not found'; END IF;
  IF v_tab.status IN ('settled','closed') THEN
    RETURN jsonb_build_object('tab_id', _tab_id, 'status', v_tab.status, 'already', true);
  END IF;
  IF v_tab.status = 'closing' AND v_tab.settled_method IS DISTINCT FROM 'online'
     AND v_tab.settled_method IS DISTINCT FROM _method THEN
    RAISE EXCEPTION 'The customer chose a different way to pay — decline it first';
  END IF;
  v_dev := CASE WHEN _token IS NOT NULL THEN public._bar_counter_device(_token) END;
  IF v_tab.status = 'open' THEN PERFORM public.settle_bar_guest_tab(_tab_id, v_tab.token, _method); END IF;
  IF v_tab.status = 'closing' AND v_tab.settled_method = 'online' THEN
    SELECT payment_reference INTO v_ref FROM public.bar_visitor_sales
     WHERE guest_tab_id = _tab_id AND payment_reference IS NOT NULL LIMIT 1;
    UPDATE public.bar_visitor_sales
       SET payment_method = CASE WHEN _method = 'cash' THEN 'cash' ELSE 'card' END,
           payment_status = 'paid',
           payment_reference = NULL,
           note = COALESCE(note, '') || ' · paid at bar counter (' || _method || ')'
     WHERE guest_tab_id = _tab_id AND payment_status <> 'paid';
  ELSE
    PERFORM set_config('sh.bar_counter_confirm', '1', true);
    UPDATE public.bar_visitor_sales
       SET payment_status = 'paid',
           payment_method = CASE WHEN _method = 'cash' THEN 'cash' ELSE 'card' END
     WHERE guest_tab_id = _tab_id AND payment_status IN ('awaiting_cash','awaiting_terminal');
    PERFORM set_config('sh.bar_counter_confirm', '', true);
  END IF;
  UPDATE public.bar_guest_tabs
     SET status = 'settled', closed_at = COALESCE(closed_at, now()), settled_method = _method,
         payment_confirmed_at = now(), payment_confirmed_by_user = auth.uid(), payment_confirmed_by_device = v_dev
   WHERE id = _tab_id;
  SELECT COALESCE(sum(total),0) INTO v_total FROM public.bar_visitor_sales WHERE guest_tab_id = _tab_id;
  INSERT INTO public.bar_tab_payment_events (club_id, tab_id, action, method, amount, actor_user_id, actor_device_id)
  VALUES (v_club, _tab_id, 'confirmed', _method, v_total, auth.uid(), v_dev);
  RETURN jsonb_build_object('tab_id', _tab_id, 'status', 'settled');
END; $function$;