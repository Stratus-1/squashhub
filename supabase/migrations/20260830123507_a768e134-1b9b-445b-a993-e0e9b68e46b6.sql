
CREATE TABLE IF NOT EXISTS public.bar_guest_tabs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  guest_name text NOT NULL,
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  club_member_id uuid REFERENCES public.club_members(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open',
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  settled_method text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bar_guest_tabs TO authenticated;
GRANT ALL ON public.bar_guest_tabs TO service_role;

ALTER TABLE public.bar_guest_tabs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Club members view guest tabs"
  ON public.bar_guest_tabs FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.club_members cm
                 WHERE cm.club_id = bar_guest_tabs.club_id AND cm.user_id = auth.uid()));

CREATE POLICY "Club admins manage guest tabs"
  ON public.bar_guest_tabs FOR ALL TO authenticated
  USING (public.is_club_admin(auth.uid(), club_id))
  WITH CHECK (public.is_club_admin(auth.uid(), club_id));

CREATE INDEX IF NOT EXISTS bar_guest_tabs_club_status_idx
  ON public.bar_guest_tabs (club_id, status, opened_at DESC);

ALTER TABLE public.bar_visitor_sales
  ADD COLUMN IF NOT EXISTS guest_tab_id uuid REFERENCES public.bar_guest_tabs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS bar_visitor_sales_guest_tab_idx
  ON public.bar_visitor_sales (guest_tab_id);

-- Open a new evening tab from a scanned QR code.
CREATE OR REPLACE FUNCTION public.open_bar_guest_tab(_code text, _guest_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_club uuid; v_member uuid; v_id uuid; v_token uuid;
BEGIN
  SELECT club_id INTO v_club FROM public.qr_short_codes WHERE code = _code AND active = true;
  IF v_club IS NULL THEN RAISE EXCEPTION 'This bar code is no longer active'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clubs WHERE id = v_club AND COALESCE(honesty_bar_enabled,false)) THEN
    RAISE EXCEPTION 'The bar is not open for orders';
  END IF;
  IF btrim(COALESCE(_guest_name,'')) = '' THEN RAISE EXCEPTION 'Please give a name for the tab'; END IF;

  IF auth.uid() IS NOT NULL THEN
    SELECT id INTO v_member FROM public.club_members
     WHERE club_id = v_club AND user_id = auth.uid() LIMIT 1;
  END IF;

  INSERT INTO public.bar_guest_tabs (club_id, guest_name, club_member_id)
  VALUES (v_club, btrim(_guest_name), v_member)
  RETURNING id, token INTO v_id, v_token;

  RETURN jsonb_build_object('tab_id', v_id, 'token', v_token, 'guest_name', btrim(_guest_name));
END; $fn$;

-- Read a tab (guest holds the private token).
CREATE OR REPLACE FUNCTION public.get_bar_guest_tab(_tab_id uuid, _token uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
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
  FROM public.bar_visitor_sales s
  LEFT JOIN public.bar_items b ON b.id = s.bar_item_id
  WHERE s.guest_tab_id = _tab_id;

  RETURN jsonb_build_object(
    'found', true, 'tab_id', v_tab.id, 'guest_name', v_tab.guest_name,
    'status', v_tab.status, 'opened_at', v_tab.opened_at,
    'lines', v_lines, 'total', v_total
  );
END; $fn$;

-- Add a round to an open tab.
CREATE OR REPLACE FUNCTION public.add_to_bar_guest_tab(_tab_id uuid, _token uuid, _lines jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_tab public.bar_guest_tabs%ROWTYPE; v_line jsonb; v_item public.bar_items%ROWTYPE; v_qty int; v_added numeric := 0;
BEGIN
  SELECT * INTO v_tab FROM public.bar_guest_tabs WHERE id = _tab_id AND token = _token;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tab not found'; END IF;
  IF v_tab.status <> 'open' THEN RAISE EXCEPTION 'This tab has already been settled'; END IF;
  IF _lines IS NULL OR jsonb_array_length(_lines) = 0 OR jsonb_array_length(_lines) > 30 THEN
    RAISE EXCEPTION 'Nothing to add';
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(_lines) LOOP
    v_qty := COALESCE((v_line->>'quantity')::int, 0);
    IF v_qty < 1 OR v_qty > 50 THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
    SELECT * INTO v_item FROM public.bar_items
     WHERE id = (v_line->>'bar_item_id')::uuid AND club_id = v_tab.club_id AND active = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'One or more items are not available'; END IF;

    INSERT INTO public.bar_visitor_sales (
      club_id, bar_item_id, quantity, unit_price, total, payment_method,
      visitor_name, note, payment_status, guest_tab_id
    ) VALUES (
      v_tab.club_id, v_item.id, v_qty, v_item.price, v_item.price * v_qty, 'tab',
      v_tab.guest_name, 'Open bar tab', 'on_tab', v_tab.id
    );
    v_added := v_added + v_item.price * v_qty;
  END LOOP;

  RETURN public.get_bar_guest_tab(_tab_id, _token);
END; $fn$;

-- Settle a tab: 'terminal' = swipe at the club's card machine, 'cash' = paid at the bar.
CREATE OR REPLACE FUNCTION public.settle_bar_guest_tab(_tab_id uuid, _token uuid, _method text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_tab public.bar_guest_tabs%ROWTYPE;
BEGIN
  SELECT * INTO v_tab FROM public.bar_guest_tabs WHERE id = _tab_id AND token = _token;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tab not found'; END IF;
  IF v_tab.status <> 'open' THEN RETURN public.get_bar_guest_tab(_tab_id, _token); END IF;
  IF _method NOT IN ('terminal','cash') THEN RAISE EXCEPTION 'Unknown payment method'; END IF;

  UPDATE public.bar_visitor_sales
     SET payment_method = CASE WHEN _method = 'cash' THEN 'cash' ELSE 'card' END,
         payment_status = CASE WHEN _method = 'cash' THEN 'awaiting_cash' ELSE 'awaiting_terminal' END,
         note = CASE WHEN _method = 'cash'
                     THEN 'Bar tab · pay cash at the bar'
                     ELSE 'Bar tab · card machine at the club' END
   WHERE guest_tab_id = _tab_id AND payment_status = 'on_tab';

  UPDATE public.bar_guest_tabs
     SET status = 'closing', closed_at = now(), settled_method = _method
   WHERE id = _tab_id;

  RETURN public.get_bar_guest_tab(_tab_id, _token);
END; $fn$;

GRANT EXECUTE ON FUNCTION public.open_bar_guest_tab(text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_bar_guest_tab(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_to_bar_guest_tab(uuid, uuid, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.settle_bar_guest_tab(uuid, uuid, text) TO anon, authenticated, service_role;
