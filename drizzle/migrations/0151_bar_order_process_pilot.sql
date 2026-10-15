ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS bar_order_process_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE public.bar_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  guest_tab_id uuid REFERENCES public.bar_guest_tabs(id) ON DELETE SET NULL,
  order_number int NOT NULL,
  customer_name text NOT NULL,
  fulfilment text NOT NULL CHECK (fulfilment IN ('collect','deliver')),
  location text,
  note text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','completed','cancelled')),
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (club_id, idempotency_key),
  UNIQUE (club_id, order_number)
);
CREATE TABLE public.bar_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.bar_orders(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  bar_item_id uuid REFERENCES public.bar_items(id) ON DELETE SET NULL,
  visitor_sale_id uuid REFERENCES public.bar_visitor_sales(id) ON DELETE SET NULL,
  item_name text NOT NULL,
  unit_price numeric NOT NULL,
  quantity int NOT NULL CHECK (quantity > 0),
  delivered_qty int NOT NULL DEFAULT 0,
  CHECK (delivered_qty >= 0 AND delivered_qty <= quantity)
);
CREATE TABLE public.bar_order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.bar_orders(id) ON DELETE CASCADE,
  line_id uuid REFERENCES public.bar_order_lines(id) ON DELETE SET NULL,
  action text NOT NULL,
  quantity int,
  actor_user_id uuid,
  actor_device_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bar_orders_club_status_idx ON public.bar_orders(club_id, status, created_at);
CREATE INDEX bar_order_lines_order_idx ON public.bar_order_lines(order_id);

GRANT SELECT ON public.bar_orders, public.bar_order_lines, public.bar_order_events TO authenticated;
GRANT ALL ON public.bar_orders, public.bar_order_lines, public.bar_order_events TO service_role;
ALTER TABLE public.bar_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bar_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bar_order_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Bar staff read orders" ON public.bar_orders FOR SELECT TO authenticated USING (public.bar_staff_can_serve(auth.uid(), club_id));
CREATE POLICY "Bar staff read order lines" ON public.bar_order_lines FOR SELECT TO authenticated USING (public.bar_staff_can_serve(auth.uid(), club_id));
CREATE POLICY "Bar staff read order events" ON public.bar_order_events FOR SELECT TO authenticated USING (public.bar_staff_can_serve(auth.uid(), club_id));

CREATE OR REPLACE FUNCTION public.bar_order_process_status(_club_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE((SELECT bar_order_process_enabled FROM public.clubs WHERE id = _club_id), false);
$$;

CREATE OR REPLACE FUNCTION public.bar_set_order_process(_club_id uuid, _enabled boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_open int;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_club_admin_or_permitted(auth.uid(), _club_id, 'bar') THEN
    RAISE EXCEPTION 'You do not have permission to change bar setup';
  END IF;
  IF NOT _enabled THEN
    SELECT count(*) INTO v_open FROM public.bar_orders WHERE club_id = _club_id AND status = 'open';
    IF v_open > 0 THEN RAISE EXCEPTION '% order(s) are still open — deliver them first', v_open; END IF;
  END IF;
  UPDATE public.clubs SET bar_order_process_enabled = _enabled WHERE id = _club_id;
  RETURN jsonb_build_object('enabled', _enabled);
END; $$;

CREATE OR REPLACE FUNCTION public._bar_order_json(_order_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT jsonb_build_object('id', o.id, 'order_number', o.order_number, 'customer_name', o.customer_name,
    'fulfilment', o.fulfilment, 'location', o.location, 'note', o.note, 'status', o.status,
    'created_at', o.created_at, 'completed_at', o.completed_at,
    'tab_status', t.status,
    'lines', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', l.id, 'item_name', l.item_name,
        'quantity', l.quantity, 'delivered_qty', l.delivered_qty, 'unit_price', l.unit_price) ORDER BY l.item_name)
      FROM public.bar_order_lines l WHERE l.order_id = o.id), '[]'::jsonb))
  FROM public.bar_orders o LEFT JOIN public.bar_guest_tabs t ON t.id = o.guest_tab_id WHERE o.id = _order_id;
$$;

-- customer: submit an order on their own open guest tab (stock/sales recorded once, here)
CREATE OR REPLACE FUNCTION public.bar_submit_guest_order(_tab_id uuid, _token uuid, _lines jsonb,
  _fulfilment text, _location text, _note text, _idempotency_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tab public.bar_guest_tabs%ROWTYPE; v_existing uuid; v_order uuid; v_num int;
  v_line jsonb; v_item public.bar_items%ROWTYPE; v_qty int; v_sale uuid;
BEGIN
  SELECT * INTO v_tab FROM public.bar_guest_tabs WHERE id = _tab_id AND token = _token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tab not found'; END IF;
  IF COALESCE(btrim(_idempotency_key),'') = '' THEN RAISE EXCEPTION 'Missing order key'; END IF;
  SELECT id INTO v_existing FROM public.bar_orders WHERE club_id = v_tab.club_id AND idempotency_key = _idempotency_key;
  IF v_existing IS NOT NULL THEN RETURN public._bar_order_json(v_existing); END IF;
  IF NOT public.bar_order_process_status(v_tab.club_id) THEN RAISE EXCEPTION 'This bar is not taking orders'; END IF;
  IF v_tab.status <> 'open' THEN RAISE EXCEPTION 'This tab has already been settled'; END IF;
  IF _fulfilment NOT IN ('collect','deliver') THEN RAISE EXCEPTION 'Choose collect or delivery'; END IF;
  IF _fulfilment = 'deliver' AND COALESCE(btrim(_location),'') = '' THEN RAISE EXCEPTION 'Where should we deliver it?'; END IF;
  IF _lines IS NULL OR jsonb_array_length(_lines) = 0 OR jsonb_array_length(_lines) > 30 THEN RAISE EXCEPTION 'Nothing to order'; END IF;

  PERFORM pg_advisory_xact_lock(hashtext('bar_orders:' || v_tab.club_id::text));
  SELECT COALESCE(max(order_number),0) + 1 INTO v_num FROM public.bar_orders WHERE club_id = v_tab.club_id;
  INSERT INTO public.bar_orders (club_id, guest_tab_id, order_number, customer_name, fulfilment, location, note, idempotency_key)
  VALUES (v_tab.club_id, v_tab.id, v_num, v_tab.guest_name, _fulfilment,
          CASE WHEN _fulfilment='deliver' THEN left(btrim(_location),60) END,
          NULLIF(left(btrim(COALESCE(_note,'')),200),''), _idempotency_key)
  RETURNING id INTO v_order;

  FOR v_line IN SELECT * FROM jsonb_array_elements(_lines) LOOP
    v_qty := COALESCE((v_line->>'quantity')::int, 0);
    IF v_qty < 1 OR v_qty > 50 THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
    SELECT * INTO v_item FROM public.bar_items WHERE id = (v_line->>'bar_item_id')::uuid AND club_id = v_tab.club_id AND active = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'One or more items are not available'; END IF;
    INSERT INTO public.bar_visitor_sales (club_id, bar_item_id, quantity, unit_price, total, payment_method,
      visitor_name, note, payment_status, guest_tab_id)
    VALUES (v_tab.club_id, v_item.id, v_qty, v_item.price, v_item.price * v_qty, 'tab',
      v_tab.guest_name, 'Bar order #' || v_num, 'on_tab', v_tab.id) RETURNING id INTO v_sale;
    INSERT INTO public.bar_order_lines (order_id, club_id, bar_item_id, visitor_sale_id, item_name, unit_price, quantity)
    VALUES (v_order, v_tab.club_id, v_item.id, v_sale, v_item.name, v_item.price, v_qty);
  END LOOP;
  INSERT INTO public.bar_order_events (club_id, order_id, action) VALUES (v_tab.club_id, v_order, 'submitted');
  RETURN public._bar_order_json(v_order);
END; $$;

CREATE OR REPLACE FUNCTION public.bar_guest_orders(_tab_id uuid, _token uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.bar_guest_tabs WHERE id = _tab_id AND token = _token) THEN RETURN '[]'::jsonb; END IF;
  RETURN COALESCE((SELECT jsonb_agg(public._bar_order_json(o.id) ORDER BY o.created_at DESC)
    FROM public.bar_orders o WHERE o.guest_tab_id = _tab_id), '[]'::jsonb);
END; $$;

-- staff: club-wide order list (counter PIN session or signed-in bar staff)
CREATE OR REPLACE FUNCTION public.bar_counter_orders(_token uuid DEFAULT NULL, _club_id uuid DEFAULT NULL, _status text DEFAULT 'open')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_club uuid;
BEGIN
  v_club := public.bar_counter_context(_token, _club_id);
  IF _status = 'open' THEN
    RETURN COALESCE((SELECT jsonb_agg(public._bar_order_json(o.id) ORDER BY o.created_at ASC)
      FROM public.bar_orders o WHERE o.club_id = v_club AND o.status = 'open'), '[]'::jsonb);
  END IF;
  RETURN COALESCE((SELECT jsonb_agg(x.j ORDER BY x.c DESC) FROM (
      SELECT public._bar_order_json(o.id) j, o.completed_at c FROM public.bar_orders o
      WHERE o.club_id = v_club AND o.status <> 'open' ORDER BY o.completed_at DESC NULLS LAST LIMIT 50) x), '[]'::jsonb);
END; $$;

CREATE OR REPLACE FUNCTION public.bar_counter_set_delivered(_line_id uuid, _delivered int, _token uuid DEFAULT NULL, _club_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_club uuid; v_line public.bar_order_lines%ROWTYPE; v_order public.bar_orders%ROWTYPE; v_left int;
BEGIN
  v_club := public.bar_counter_context(_token, _club_id);
  SELECT * INTO v_line FROM public.bar_order_lines WHERE id = _line_id AND club_id = v_club FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order item not found'; END IF;
  SELECT * INTO v_order FROM public.bar_orders WHERE id = v_line.order_id FOR UPDATE;
  IF v_order.status = 'cancelled' THEN RAISE EXCEPTION 'This order was cancelled'; END IF;
  IF _delivered < 0 OR _delivered > v_line.quantity THEN RAISE EXCEPTION 'Invalid delivered quantity'; END IF;
  IF _delivered <> v_line.delivered_qty THEN
    UPDATE public.bar_order_lines SET delivered_qty = _delivered WHERE id = _line_id;
    INSERT INTO public.bar_order_events (club_id, order_id, line_id, action, quantity, actor_user_id, actor_device_id)
    VALUES (v_club, v_order.id, _line_id, 'delivered_set', _delivered, auth.uid(), public.bar_counter_device_for_token(_token));
  END IF;
  SELECT COALESCE(sum(quantity - delivered_qty),0) INTO v_left FROM public.bar_order_lines WHERE order_id = v_order.id;
  IF v_left = 0 AND v_order.status = 'open' THEN
    UPDATE public.bar_orders SET status = 'completed', completed_at = now() WHERE id = v_order.id;
    INSERT INTO public.bar_order_events (club_id, order_id, action, actor_user_id, actor_device_id)
    VALUES (v_club, v_order.id, 'completed', auth.uid(), public.bar_counter_device_for_token(_token));
  ELSIF v_left > 0 AND v_order.status = 'completed' THEN
    UPDATE public.bar_orders SET status = 'open', completed_at = NULL WHERE id = v_order.id;
    INSERT INTO public.bar_order_events (club_id, order_id, action, actor_user_id, actor_device_id)
    VALUES (v_club, v_order.id, 'reopened', auth.uid(), public.bar_counter_device_for_token(_token));
  END IF;
  RETURN public._bar_order_json(v_order.id);
END; $$;

REVOKE EXECUTE ON FUNCTION public._bar_order_json(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bar_order_process_status(uuid), public.bar_submit_guest_order(uuid,uuid,jsonb,text,text,text,text),
  public.bar_guest_orders(uuid,uuid), public.bar_counter_orders(uuid,uuid,text), public.bar_counter_set_delivered(uuid,int,uuid,uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bar_set_order_process(uuid, boolean) TO authenticated;