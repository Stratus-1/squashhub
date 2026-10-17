CREATE OR REPLACE FUNCTION public.bar_counter_close_empty_tab(_tab_id uuid, _token uuid DEFAULT NULL::uuid, _club_id uuid DEFAULT NULL::uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_club uuid; v_tab public.bar_guest_tabs%ROWTYPE; v_total numeric; v_dev uuid;
BEGIN
  v_club := public.bar_counter_context(_token, _club_id);
  IF _token IS NULL AND auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to close tabs'; END IF;
  SELECT * INTO v_tab FROM public.bar_guest_tabs WHERE id = _tab_id AND club_id = v_club FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tab not found'; END IF;
  IF v_tab.status IN ('settled','closed') THEN
    RETURN jsonb_build_object('tab_id', _tab_id, 'status', v_tab.status, 'already', true);
  END IF;
  SELECT COALESCE(sum(total),0) INTO v_total FROM public.bar_visitor_sales WHERE guest_tab_id = _tab_id;
  IF v_total <> 0 THEN RAISE EXCEPTION 'This tab has charges — settle it instead of closing it'; END IF;
  v_dev := CASE WHEN _token IS NOT NULL THEN public._bar_counter_device(_token) END;
  UPDATE public.bar_guest_tabs
     SET status = 'closed', closed_at = COALESCE(closed_at, now())
   WHERE id = _tab_id;
  INSERT INTO public.bar_tab_payment_events (club_id, tab_id, action, method, amount, actor_user_id, actor_device_id)
  VALUES (v_club, _tab_id, 'closed_empty', NULL, 0, auth.uid(), v_dev);
  RETURN jsonb_build_object('tab_id', _tab_id, 'status', 'closed');
END; $function$;

GRANT EXECUTE ON FUNCTION public.bar_counter_close_empty_tab(uuid, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bar_counter_close_empty_tab(uuid, uuid, uuid) TO anon;