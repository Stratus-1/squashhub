ALTER TABLE public.bar_guest_tabs ADD COLUMN IF NOT EXISTS payment_confirmed_at timestamptz;
ALTER TABLE public.bar_guest_tabs ADD COLUMN IF NOT EXISTS payment_confirmed_by_user uuid;
ALTER TABLE public.bar_guest_tabs ADD COLUMN IF NOT EXISTS payment_confirmed_by_device uuid;

CREATE TABLE public.bar_tab_payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  tab_id uuid NOT NULL REFERENCES public.bar_guest_tabs(id) ON DELETE CASCADE,
  action text NOT NULL,
  method text,
  amount numeric,
  reason text,
  actor_user_id uuid,
  actor_device_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bar_tab_payment_events_tab_idx ON public.bar_tab_payment_events(tab_id, created_at);
GRANT SELECT ON public.bar_tab_payment_events TO authenticated;
GRANT ALL ON public.bar_tab_payment_events TO service_role;
ALTER TABLE public.bar_tab_payment_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Bar staff read tab payment events" ON public.bar_tab_payment_events FOR SELECT TO authenticated
  USING (public.bar_staff_can_serve(auth.uid(), club_id));

CREATE OR REPLACE FUNCTION public._bar_counter_device(_token uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT device_id FROM public.bar_counter_sessions WHERE token = _token AND revoked_at IS NULL AND expires_at > now() LIMIT 1;
$$;

-- Customer-facing tab read now includes how it is being paid.
CREATE OR REPLACE FUNCTION public.get_bar_guest_tab(_tab_id uuid, _token uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_tab public.bar_guest_tabs%ROWTYPE; v_lines jsonb; v_total numeric;
BEGIN
  SELECT * INTO v_tab FROM public.bar_guest_tabs WHERE id = _tab_id AND token = _token;
  IF NOT FOUND THEN RETURN jsonb_build_object('found', false); END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', s.id, 'name', b.name, 'quantity', s.quantity,
           'unit_price', s.unit_price, 'total', s.total, 'created_at', s.created_at
         ) ORDER BY s.created_at), '[]'::jsonb),
         COALESCE(sum(s.total), 0)
    INTO v_lines, v_total
  FROM public.bar_visitor_sales s LEFT JOIN public.bar_items b ON b.id = s.bar_item_id
  WHERE s.guest_tab_id = _tab_id;
  RETURN jsonb_build_object(
    'found', true, 'tab_id', v_tab.id, 'guest_name', v_tab.guest_name,
    'status', v_tab.status, 'settled_method', v_tab.settled_method, 'opened_at', v_tab.opened_at,
    'payment_confirmed_at', v_tab.payment_confirmed_at,
    'lines', v_lines, 'total', v_total);
END; $function$;

-- Counter board: same as before plus settled_method so the screen can tell card machine from online.
CREATE OR REPLACE FUNCTION public.bar_counter_board(_token uuid DEFAULT NULL::uuid, _club_id uuid DEFAULT NULL::uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
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
             'status', g.status, 'settled_method', g.settled_method, 'opened_at', g.opened_at,
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
  SELECT code INTO v_code FROM public.qr_short_codes WHERE club_id = v_club AND active AND bar_item_id IS NULL LIMIT 1;
  RETURN jsonb_build_object('club_id', v_club, 'club_name', v_c.name,
    'cash_enabled', COALESCE(v_c.bar_cash_enabled, false),
    'card_enabled', COALESCE(v_c.bar_card_swipe_enabled, true),
    'account_enabled', COALESCE(v_c.bar_account_tab_enabled, true),
    'online_enabled', COALESCE(v_c.bar_pay_online_enabled, true),
    'payment_gateway', lower(COALESCE(v_c.payment_gateway, '')),
    'venue_code', v_code, 'items', v_items, 'tabs', v_tabs);
END; $function$;

-- Customer asks to pay cash / card machine: tab waits at the counter, nothing is marked paid.
CREATE OR REPLACE FUNCTION public.settle_bar_guest_tab(_tab_id uuid, _token uuid, _method text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_tab public.bar_guest_tabs%ROWTYPE; v_club public.clubs%ROWTYPE; v_total numeric;
BEGIN
  SELECT * INTO v_tab FROM public.bar_guest_tabs WHERE id = _tab_id AND token = _token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tab not found'; END IF;
  IF v_tab.status <> 'open' THEN RETURN public.get_bar_guest_tab(_tab_id, _token); END IF;
  IF _method NOT IN ('terminal','cash') THEN RAISE EXCEPTION 'Unknown payment method'; END IF;
  SELECT * INTO v_club FROM public.clubs WHERE id = v_tab.club_id;
  IF _method = 'cash' AND NOT COALESCE(v_club.bar_cash_enabled, false) THEN RAISE EXCEPTION 'Cash payments are not enabled at this club'; END IF;
  IF _method = 'terminal' AND COALESCE(v_club.bar_card_swipe_enabled, true) = false THEN RAISE EXCEPTION 'Card machine payments are not enabled at this club'; END IF;
  UPDATE public.bar_visitor_sales
     SET payment_method = CASE WHEN _method = 'cash' THEN 'cash' ELSE 'terminal' END,
         payment_status = CASE WHEN _method = 'cash' THEN 'awaiting_cash' ELSE 'awaiting_terminal' END,
         note = CASE WHEN _method = 'cash' THEN 'Bar tab · pay cash at the bar' ELSE 'Bar tab · card machine at the counter' END
   WHERE guest_tab_id = _tab_id AND payment_status = 'on_tab';
  UPDATE public.bar_guest_tabs SET status = 'closing', closed_at = now(), settled_method = _method WHERE id = _tab_id;
  SELECT COALESCE(sum(total),0) INTO v_total FROM public.bar_visitor_sales WHERE guest_tab_id = _tab_id;
  INSERT INTO public.bar_tab_payment_events (club_id, tab_id, action, method, amount)
  VALUES (v_tab.club_id, _tab_id, 'requested', _method, v_total);
  RETURN public.get_bar_guest_tab(_tab_id, _token);
END; $function$;

-- Staff confirms payment taken (cash or card machine approved). Idempotent; never closes an online payment.
CREATE OR REPLACE FUNCTION public.bar_counter_settle_tab(_tab_id uuid, _method text, _token uuid DEFAULT NULL::uuid, _club_id uuid DEFAULT NULL::uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_club uuid; v_tab public.bar_guest_tabs%ROWTYPE; v_total numeric; v_dev uuid;
BEGIN
  v_club := public.bar_counter_context(_token, _club_id);
  IF _method NOT IN ('terminal','cash') THEN RAISE EXCEPTION 'Unknown payment method'; END IF;
  SELECT * INTO v_tab FROM public.bar_guest_tabs WHERE id = _tab_id AND club_id = v_club FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tab not found'; END IF;
  IF v_tab.status IN ('settled','closed') THEN
    RETURN jsonb_build_object('tab_id', _tab_id, 'status', v_tab.status, 'already', true);
  END IF;
  IF v_tab.status = 'closing' AND v_tab.settled_method = 'online' THEN
    RAISE EXCEPTION 'This tab is waiting for an online card payment — cancel that first';
  END IF;
  v_dev := CASE WHEN _token IS NOT NULL THEN public._bar_counter_device(_token) END;
  IF v_tab.status = 'open' THEN PERFORM public.settle_bar_guest_tab(_tab_id, v_tab.token, _method); END IF;
  UPDATE public.bar_visitor_sales
     SET payment_status = 'paid',
         payment_method = CASE WHEN _method = 'cash' THEN 'cash' ELSE 'terminal' END
   WHERE guest_tab_id = _tab_id AND payment_status IN ('awaiting_cash','awaiting_terminal');
  UPDATE public.bar_guest_tabs
     SET status = 'settled', closed_at = COALESCE(closed_at, now()), settled_method = _method,
         payment_confirmed_at = now(), payment_confirmed_by_user = auth.uid(), payment_confirmed_by_device = v_dev
   WHERE id = _tab_id;
  SELECT COALESCE(sum(total),0) INTO v_total FROM public.bar_visitor_sales WHERE guest_tab_id = _tab_id;
  INSERT INTO public.bar_tab_payment_events (club_id, tab_id, action, method, amount, actor_user_id, actor_device_id)
  VALUES (v_club, _tab_id, 'confirmed', _method, v_total, auth.uid(), v_dev);
  RETURN jsonb_build_object('tab_id', _tab_id, 'status', 'settled');
END; $function$;

CREATE OR REPLACE FUNCTION public._bar_reopen_tab(_tab public.bar_guest_tabs, _action text, _reason text, _user uuid, _device uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_total numeric;
BEGIN
  UPDATE public.bar_visitor_sales SET payment_status = 'on_tab', payment_method = 'tab', note = 'Bar tab'
   WHERE guest_tab_id = _tab.id AND payment_status IN ('awaiting_cash','awaiting_terminal');
  UPDATE public.bar_guest_tabs SET status = 'open', closed_at = NULL, settled_method = NULL WHERE id = _tab.id;
  SELECT COALESCE(sum(total),0) INTO v_total FROM public.bar_visitor_sales WHERE guest_tab_id = _tab.id;
  INSERT INTO public.bar_tab_payment_events (club_id, tab_id, action, method, amount, reason, actor_user_id, actor_device_id)
  VALUES (_tab.club_id, _tab.id, _action, _tab.settled_method, v_total, NULLIF(left(btrim(COALESCE(_reason,'')),200),''), _user, _device);
END; $$;
REVOKE ALL ON FUNCTION public._bar_reopen_tab(public.bar_guest_tabs, text, text, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Staff: card declined / not paid → back to an open tab (nothing charged).
CREATE OR REPLACE FUNCTION public.bar_counter_reopen_tab(_tab_id uuid, _reason text, _token uuid DEFAULT NULL, _club_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_club uuid; v_tab public.bar_guest_tabs%ROWTYPE;
BEGIN
  v_club := public.bar_counter_context(_token, _club_id);
  SELECT * INTO v_tab FROM public.bar_guest_tabs WHERE id = _tab_id AND club_id = v_club FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tab not found'; END IF;
  IF v_tab.status <> 'closing' OR v_tab.settled_method NOT IN ('terminal','cash') THEN
    RETURN jsonb_build_object('tab_id', _tab_id, 'status', v_tab.status, 'unchanged', true);
  END IF;
  PERFORM public._bar_reopen_tab(v_tab, 'declined', _reason, auth.uid(), CASE WHEN _token IS NOT NULL THEN public._bar_counter_device(_token) END);
  RETURN jsonb_build_object('tab_id', _tab_id, 'status', 'open');
END; $$;
GRANT EXECUTE ON FUNCTION public.bar_counter_reopen_tab(uuid, text, uuid, uuid) TO anon, authenticated;

-- Customer: changed mind before staff confirmed → back to open tab.
CREATE OR REPLACE FUNCTION public.bar_guest_cancel_counter_payment(_tab_id uuid, _token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tab public.bar_guest_tabs%ROWTYPE;
BEGIN
  SELECT * INTO v_tab FROM public.bar_guest_tabs WHERE id = _tab_id AND token = _token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tab not found'; END IF;
  IF v_tab.status = 'closing' AND v_tab.settled_method IN ('terminal','cash') THEN
    PERFORM public._bar_reopen_tab(v_tab, 'customer_cancelled', NULL, NULL, NULL);
  END IF;
  RETURN public.get_bar_guest_tab(_tab_id, _token);
END; $$;
GRANT EXECUTE ON FUNCTION public.bar_guest_cancel_counter_payment(uuid, uuid) TO anon, authenticated;

-- "Swipe my card at the counter" from the cart: an awaiting-payment tab the counter must confirm. Never marked paid here.
CREATE OR REPLACE FUNCTION public.record_bar_terminal_sale(_lines jsonb, _code text DEFAULT NULL::text, _club_id uuid DEFAULT NULL::uuid, _buyer_name text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_club_id uuid; v_line jsonb; v_item public.bar_items%ROWTYPE; v_qty int; v_total numeric := 0;
  v_member uuid; v_tab uuid; v_token uuid := gen_random_uuid(); v_name text;
BEGIN
  IF _code IS NOT NULL THEN
    SELECT club_id INTO v_club_id FROM public.qr_short_codes WHERE code = _code AND active = true;
  ELSE
    v_club_id := _club_id;
    IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in to place this order'; END IF;
    SELECT id INTO v_member FROM public.club_members WHERE club_id = v_club_id AND user_id = auth.uid() LIMIT 1;
    IF v_member IS NULL AND NOT public.is_club_member(auth.uid(), v_club_id) THEN RAISE EXCEPTION 'You are not a member of this club'; END IF;
  END IF;
  IF v_club_id IS NULL THEN RAISE EXCEPTION 'This bar code is no longer active'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clubs WHERE id = v_club_id AND COALESCE(honesty_bar_enabled, false) AND COALESCE(bar_card_swipe_enabled, true)) THEN
    RAISE EXCEPTION 'Card machine payments are not available at this club';
  END IF;
  IF _lines IS NULL OR jsonb_array_length(_lines) = 0 OR jsonb_array_length(_lines) > 30 THEN RAISE EXCEPTION 'Nothing to pay for'; END IF;
  v_name := COALESCE(NULLIF(btrim(COALESCE(_buyer_name, '')), ''), 'Card at counter');
  INSERT INTO public.bar_guest_tabs (club_id, guest_name, token, club_member_id, status, closed_at, settled_method)
  VALUES (v_club_id, left(v_name, 60), v_token, v_member, 'closing', now(), 'terminal') RETURNING id INTO v_tab;
  FOR v_line IN SELECT * FROM jsonb_array_elements(_lines) LOOP
    v_qty := COALESCE((v_line->>'quantity')::int, 0);
    IF v_qty < 1 OR v_qty > 50 THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
    SELECT * INTO v_item FROM public.bar_items WHERE id = (v_line->>'bar_item_id')::uuid AND club_id = v_club_id AND active = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'One or more items are not available'; END IF;
    INSERT INTO public.bar_visitor_sales (club_id, bar_item_id, quantity, unit_price, total, payment_method, visitor_name, note, payment_status, logged_by, guest_tab_id)
    VALUES (v_club_id, v_item.id, v_qty, v_item.price, v_item.price * v_qty, 'terminal', v_name,
      'Card machine at the counter · awaiting staff confirmation', 'awaiting_terminal', v_member, v_tab);
    v_total := v_total + v_item.price * v_qty;
  END LOOP;
  INSERT INTO public.bar_tab_payment_events (club_id, tab_id, action, method, amount) VALUES (v_club_id, v_tab, 'requested', 'terminal', v_total);
  RETURN jsonb_build_object('ok', true, 'tab_id', v_tab, 'token', v_token, 'status', 'closing',
    'reference', 'BAR-' || upper(substr(v_tab::text, 1, 8)), 'total', v_total);
END; $function$;