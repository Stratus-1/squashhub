-- Only the staff confirmation path may turn an awaiting counter payment into paid.
CREATE OR REPLACE FUNCTION public._bar_guard_counter_paid()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF OLD.payment_status IN ('awaiting_terminal','awaiting_cash') AND NEW.payment_status IN ('paid','recorded','settled')
     AND COALESCE(current_setting('sh.bar_counter_confirm', true), '') <> '1' THEN
    RAISE EXCEPTION 'Counter payments can only be marked paid by bar staff confirming the payment';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_bar_guard_counter_paid ON public.bar_visitor_sales;
CREATE TRIGGER trg_bar_guard_counter_paid BEFORE UPDATE OF payment_status ON public.bar_visitor_sales
  FOR EACH ROW EXECUTE FUNCTION public._bar_guard_counter_paid();

CREATE OR REPLACE FUNCTION public.bar_counter_settle_tab(_tab_id uuid, _method text, _token uuid DEFAULT NULL::uuid, _club_id uuid DEFAULT NULL::uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_club uuid; v_tab public.bar_guest_tabs%ROWTYPE; v_total numeric; v_dev uuid;
BEGIN
  v_club := public.bar_counter_context(_token, _club_id);
  IF _token IS NULL AND auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to confirm payments'; END IF;
  IF _method NOT IN ('terminal','cash') THEN RAISE EXCEPTION 'Unknown payment method'; END IF;
  SELECT * INTO v_tab FROM public.bar_guest_tabs WHERE id = _tab_id AND club_id = v_club FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tab not found'; END IF;
  IF v_tab.status IN ('settled','closed') THEN
    RETURN jsonb_build_object('tab_id', _tab_id, 'status', v_tab.status, 'already', true);
  END IF;
  IF v_tab.status = 'closing' AND v_tab.settled_method = 'online' THEN
    RAISE EXCEPTION 'This tab is waiting for an online card payment — cancel that first';
  END IF;
  IF v_tab.status = 'closing' AND v_tab.settled_method IS DISTINCT FROM _method THEN
    RAISE EXCEPTION 'The customer chose a different way to pay — decline it first';
  END IF;
  v_dev := CASE WHEN _token IS NOT NULL THEN public._bar_counter_device(_token) END;
  IF v_tab.status = 'open' THEN PERFORM public.settle_bar_guest_tab(_tab_id, v_tab.token, _method); END IF;
  PERFORM set_config('sh.bar_counter_confirm', '1', true);
  UPDATE public.bar_visitor_sales
     SET payment_status = 'paid',
         payment_method = CASE WHEN _method = 'cash' THEN 'cash' ELSE 'card' END
   WHERE guest_tab_id = _tab_id AND payment_status IN ('awaiting_cash','awaiting_terminal');
  PERFORM set_config('sh.bar_counter_confirm', '', true);
  UPDATE public.bar_guest_tabs
     SET status = 'settled', closed_at = COALESCE(closed_at, now()), settled_method = _method,
         payment_confirmed_at = now(), payment_confirmed_by_user = auth.uid(), payment_confirmed_by_device = v_dev
   WHERE id = _tab_id;
  SELECT COALESCE(sum(total),0) INTO v_total FROM public.bar_visitor_sales WHERE guest_tab_id = _tab_id;
  INSERT INTO public.bar_tab_payment_events (club_id, tab_id, action, method, amount, actor_user_id, actor_device_id)
  VALUES (v_club, _tab_id, 'confirmed', _method, v_total, auth.uid(), v_dev);
  RETURN jsonb_build_object('tab_id', _tab_id, 'status', 'settled');
END; $function$;

CREATE OR REPLACE FUNCTION public._bar_order_json(_order_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT jsonb_build_object('id', o.id, 'order_number', o.order_number, 'customer_name', o.customer_name,
    'fulfilment', o.fulfilment, 'location', o.location, 'note', o.note, 'status', o.status,
    'created_at', o.created_at, 'completed_at', o.completed_at,
    'tab_id', t.id, 'tab_status', t.status, 'tab_settled_method', t.settled_method,
    'tab_total', COALESCE((SELECT sum(s.total) FROM public.bar_visitor_sales s WHERE s.guest_tab_id = t.id), 0),
    'payment_confirmed_at', t.payment_confirmed_at,
    'member_linked', (t.club_member_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.club_members m WHERE m.id = t.club_member_id AND m.user_id IS NOT NULL)),
    'lines', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', l.id, 'item_name', l.item_name,
        'quantity', l.quantity, 'delivered_qty', l.delivered_qty, 'unit_price', l.unit_price,
        'ready_qty', l.ready_qty, 'ready_notified_at', l.ready_notified_at, 'ready_notify_count', l.ready_notify_count) ORDER BY l.item_name)
      FROM public.bar_order_lines l WHERE l.order_id = o.id), '[]'::jsonb))
  FROM public.bar_orders o LEFT JOIN public.bar_guest_tabs t ON t.id = o.guest_tab_id WHERE o.id = _order_id;
$function$;

-- Completed list should also include orders whose payment is still awaited.
CREATE OR REPLACE FUNCTION public.bar_counter_orders(_token uuid DEFAULT NULL::uuid, _club_id uuid DEFAULT NULL::uuid, _status text DEFAULT 'open'::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_club uuid;
BEGIN
  v_club := public.bar_counter_context(_token, _club_id);
  IF _status = 'open' THEN
    RETURN COALESCE((SELECT jsonb_agg(public._bar_order_json(o.id) ORDER BY o.created_at ASC)
      FROM public.bar_orders o LEFT JOIN public.bar_guest_tabs t ON t.id = o.guest_tab_id
      WHERE o.club_id = v_club AND (o.status = 'open'
        OR (o.status = 'completed' AND t.status = 'closing' AND t.settled_method IN ('terminal','cash')))), '[]'::jsonb);
  END IF;
  RETURN COALESCE((SELECT jsonb_agg(x.j ORDER BY x.c DESC) FROM (
      SELECT public._bar_order_json(o.id) j, o.completed_at c FROM public.bar_orders o
      WHERE o.club_id = v_club AND o.status <> 'open' ORDER BY o.completed_at DESC NULLS LAST LIMIT 50) x), '[]'::jsonb);
END; $function$;