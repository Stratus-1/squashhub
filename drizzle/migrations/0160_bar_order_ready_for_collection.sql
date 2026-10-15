ALTER TABLE public.bar_order_lines ADD COLUMN IF NOT EXISTS ready_qty integer NOT NULL DEFAULT 0;
ALTER TABLE public.bar_order_lines ADD COLUMN IF NOT EXISTS ready_notified_at timestamptz;
ALTER TABLE public.bar_order_lines ADD COLUMN IF NOT EXISTS ready_notify_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public._bar_order_json(_order_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT jsonb_build_object('id', o.id, 'order_number', o.order_number, 'customer_name', o.customer_name,
    'fulfilment', o.fulfilment, 'location', o.location, 'note', o.note, 'status', o.status,
    'created_at', o.created_at, 'completed_at', o.completed_at,
    'tab_status', t.status,
    'member_linked', (t.club_member_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.club_members m WHERE m.id = t.club_member_id AND m.user_id IS NOT NULL)),
    'lines', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', l.id, 'item_name', l.item_name,
        'quantity', l.quantity, 'delivered_qty', l.delivered_qty, 'unit_price', l.unit_price,
        'ready_qty', l.ready_qty, 'ready_notified_at', l.ready_notified_at, 'ready_notify_count', l.ready_notify_count) ORDER BY l.item_name)
      FROM public.bar_order_lines l WHERE l.order_id = o.id), '[]'::jsonb))
  FROM public.bar_orders o LEFT JOIN public.bar_guest_tabs t ON t.id = o.guest_tab_id WHERE o.id = _order_id;
$function$;

-- Collect-at-bar only: mark the undelivered remainder of the chosen items ready and notify the ordering member.
-- Never changes delivered quantities, payment or tab state. A repeat without _resend returns already=true.
CREATE OR REPLACE FUNCTION public.bar_counter_notify_ready(_line_ids uuid[], _resend boolean DEFAULT false, _token uuid DEFAULT NULL, _club_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_club uuid; v_order public.bar_orders%ROWTYPE; v_tab public.bar_guest_tabs%ROWTYPE;
  v_user uuid; v_member uuid; v_names text; v_ids uuid[]; v_dev uuid; v_last timestamptz;
BEGIN
  v_club := public.bar_counter_context(_token, _club_id);
  IF _line_ids IS NULL OR array_length(_line_ids, 1) IS NULL OR array_length(_line_ids, 1) > 30 THEN RAISE EXCEPTION 'Choose the items that are ready'; END IF;
  SELECT o.* INTO v_order FROM public.bar_orders o
    WHERE o.id = (SELECT order_id FROM public.bar_order_lines WHERE id = _line_ids[1] AND club_id = v_club) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order item not found'; END IF;
  IF v_order.status <> 'open' THEN RAISE EXCEPTION 'This order is no longer open'; END IF;
  IF v_order.fulfilment <> 'collect' THEN RAISE EXCEPTION 'Ready-for-collection is only for collect-at-bar orders'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(_line_ids) x(id) WHERE NOT EXISTS (SELECT 1 FROM public.bar_order_lines l WHERE l.id = x.id AND l.order_id = v_order.id)) THEN
    RAISE EXCEPTION 'Items must belong to one order';
  END IF;
  PERFORM 1 FROM public.bar_order_lines WHERE id = ANY(_line_ids) FOR UPDATE;
  SELECT array_agg(id), max(ready_notified_at) INTO v_ids, v_last FROM public.bar_order_lines
   WHERE id = ANY(_line_ids) AND delivered_qty < quantity;
  IF v_ids IS NULL THEN RETURN jsonb_build_object('notified', false, 'reason', 'all_delivered', 'order', public._bar_order_json(v_order.id)); END IF;
  IF NOT _resend AND NOT EXISTS (SELECT 1 FROM public.bar_order_lines WHERE id = ANY(v_ids) AND ready_notified_at IS NULL) THEN
    RETURN jsonb_build_object('notified', false, 'already', true, 'notified_at', v_last, 'order', public._bar_order_json(v_order.id));
  END IF;
  v_dev := CASE WHEN _token IS NOT NULL THEN public.bar_counter_device_for_token(_token) END;
  UPDATE public.bar_order_lines SET ready_qty = quantity - delivered_qty, ready_notified_at = now(), ready_notify_count = ready_notify_count + 1
   WHERE id = ANY(v_ids);
  INSERT INTO public.bar_order_events (club_id, order_id, line_id, action, quantity, actor_user_id, actor_device_id)
  SELECT v_club, v_order.id, l.id, CASE WHEN _resend AND l.ready_notify_count > 1 THEN 'ready_resent' ELSE 'ready_notified' END, l.ready_qty, auth.uid(), v_dev
    FROM public.bar_order_lines l WHERE l.id = ANY(v_ids);
  SELECT string_agg(l.ready_qty || '× ' || l.item_name, ', ' ORDER BY l.item_name) INTO v_names FROM public.bar_order_lines l WHERE l.id = ANY(v_ids);
  SELECT * INTO v_tab FROM public.bar_guest_tabs WHERE id = v_order.guest_tab_id;
  IF v_tab.club_member_id IS NOT NULL THEN
    SELECT id, user_id INTO v_member, v_user FROM public.club_members WHERE id = v_tab.club_member_id;
  END IF;
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('notified', false, 'reason', 'no_member_account', 'marked_ready', true, 'order', public._bar_order_json(v_order.id));
  END IF;
  INSERT INTO public.notifications (user_id, club_member_id, title, message, type, url, data)
  VALUES (v_user, v_member, 'Ready at the bar',
    'Order #' || v_order.order_number || ': ' || v_names || ' — ready for collection at the bar.',
    'bar_order_ready', '/honesty-bar',
    jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number, 'line_ids', to_jsonb(v_ids), 'club_id', v_club));
  RETURN jsonb_build_object('notified', true, 'order', public._bar_order_json(v_order.id));
END; $$;
GRANT EXECUTE ON FUNCTION public.bar_counter_notify_ready(uuid[], boolean, uuid, uuid) TO anon, authenticated;