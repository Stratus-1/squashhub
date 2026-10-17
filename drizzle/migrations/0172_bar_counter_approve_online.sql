CREATE OR REPLACE FUNCTION public.bar_counter_approve_online(_tab_id uuid, _token uuid DEFAULT NULL::uuid, _club_id uuid DEFAULT NULL::uuid, _reason text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_club uuid; v_tab public.bar_guest_tabs%ROWTYPE; v_total numeric; v_dev uuid; v_pending int;
BEGIN
  v_club := public.bar_counter_context(_token, _club_id);
  IF _token IS NULL AND auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to confirm payments'; END IF;
  SELECT * INTO v_tab FROM public.bar_guest_tabs WHERE id = _tab_id AND club_id = v_club FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tab not found'; END IF;
  IF v_tab.status IN ('settled','closed') THEN
    RETURN jsonb_build_object('tab_id', _tab_id, 'status', v_tab.status, 'already', true);
  END IF;
  IF v_tab.status <> 'closing' OR v_tab.settled_method IS DISTINCT FROM 'online' THEN
    RAISE EXCEPTION 'This tab is not waiting for an online card payment';
  END IF;
  SELECT count(*) INTO v_pending FROM public.bar_visitor_sales
   WHERE guest_tab_id = _tab_id AND payment_status = 'pending';
  IF v_pending = 0 THEN RAISE EXCEPTION 'No online payment is pending on this tab'; END IF;
  v_dev := CASE WHEN _token IS NOT NULL THEN public._bar_counter_device(_token) END;
  PERFORM set_config('sh.bar_counter_confirm', '1', true);
  UPDATE public.bar_visitor_sales
     SET payment_status = 'paid',
         note = COALESCE(note, '') || ' · approved at bar counter' || CASE WHEN _reason IS NOT NULL AND btrim(_reason) <> '' THEN ' (' || left(btrim(_reason), 120) || ')' ELSE '' END
   WHERE guest_tab_id = _tab_id AND payment_status = 'pending';
  PERFORM set_config('sh.bar_counter_confirm', '', true);
  UPDATE public.bar_guest_tabs
     SET status = 'settled', closed_at = COALESCE(closed_at, now()), settled_method = 'online',
         payment_confirmed_at = now(), payment_confirmed_by_user = auth.uid(), payment_confirmed_by_device = v_dev
   WHERE id = _tab_id;
  SELECT COALESCE(sum(total),0) INTO v_total FROM public.bar_visitor_sales WHERE guest_tab_id = _tab_id;
  INSERT INTO public.bar_tab_payment_events (club_id, tab_id, action, method, amount, actor_user_id, actor_device_id)
  VALUES (v_club, _tab_id, 'confirmed', 'online', v_total, auth.uid(), v_dev);
  RETURN jsonb_build_object('tab_id', _tab_id, 'status', 'settled', 'approved', true);
END; $function$;

GRANT EXECUTE ON FUNCTION public.bar_counter_approve_online(uuid, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bar_counter_approve_online(uuid, uuid, uuid, text) TO anon;