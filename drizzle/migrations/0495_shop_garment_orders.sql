ALTER TABLE public.bar_items ADD COLUMN IF NOT EXISTS order_options jsonb;

CREATE TABLE public.shop_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  club_member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  bar_item_id uuid NOT NULL REFERENCES public.bar_items(id),
  request_id uuid NOT NULL,
  fit text NOT NULL,
  size text NOT NULL,
  back_name text NOT NULL CHECK (char_length(back_name) BETWEEN 1 AND 20),
  unit_price numeric NOT NULL,
  unit_cost numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ordered' CHECK (status IN ('ordered','with_printer','ready','collected','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
CREATE INDEX shop_orders_club_idx ON public.shop_orders(club_id, status);
CREATE INDEX shop_orders_member_idx ON public.shop_orders(club_member_id);

GRANT SELECT ON public.shop_orders TO authenticated;
GRANT ALL ON public.shop_orders TO service_role;
ALTER TABLE public.shop_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read own shop orders" ON public.shop_orders FOR SELECT TO authenticated
USING (club_member_id IN (SELECT id FROM public.club_members WHERE user_id = auth.uid()));
CREATE POLICY "Bar managers read club shop orders" ON public.shop_orders FOR SELECT TO authenticated
USING (public.is_club_admin_or_permitted(auth.uid(), club_id, 'bar.view'));

CREATE OR REPLACE FUNCTION public.shop_place_order(_club_member_id uuid, _bar_item_id uuid, _lines jsonb, _request_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_club uuid; v_item record; v_line jsonb; v_n int := 0; v_name text; v_fits jsonb;
BEGIN
  SELECT club_id INTO v_club FROM club_members WHERE id = _club_member_id AND user_id = auth.uid();
  IF v_club IS NULL THEN RAISE EXCEPTION 'Please log in again to place this order'; END IF;
  SELECT * INTO v_item FROM bar_items WHERE id = _bar_item_id AND club_id = v_club AND active AND archived_at IS NULL;
  IF v_item IS NULL OR v_item.order_options IS NULL THEN RAISE EXCEPTION 'This item cannot be ordered'; END IF;
  IF EXISTS (SELECT 1 FROM shop_orders WHERE request_id = _request_id) THEN
    RETURN (SELECT count(*) FROM shop_orders WHERE request_id = _request_id);
  END IF;
  IF jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines) NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Add between 1 and 20 shirts'; END IF;
  v_fits := v_item.order_options->'fits';
  FOR v_line IN SELECT * FROM jsonb_array_elements(_lines) LOOP
    v_name := btrim(coalesce(v_line->>'back_name',''));
    IF char_length(v_name) NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Name on the back must be 1 to 20 characters'; END IF;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_fits) f
       WHERE f->>'key' = v_line->>'fit' AND (f->'sizes') @> jsonb_build_array(v_line->>'size')) THEN
      RAISE EXCEPTION 'Please choose a valid fit and size';
    END IF;
    INSERT INTO shop_orders(club_id, club_member_id, bar_item_id, request_id, fit, size, back_name, unit_price, unit_cost)
    VALUES (v_club, _club_member_id, _bar_item_id, _request_id, v_line->>'fit', v_line->>'size', v_name, v_item.price, v_item.cost_price);
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END $$;

CREATE OR REPLACE FUNCTION public.shop_set_order_status(_order_id uuid, _status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_club uuid;
BEGIN
  SELECT club_id INTO v_club FROM shop_orders WHERE id = _order_id;
  IF v_club IS NULL OR NOT public.is_club_admin_or_permitted(auth.uid(), v_club, 'bar.stock') THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF _status NOT IN ('ordered','with_printer','ready','collected','cancelled') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  UPDATE shop_orders SET status = _status, updated_at = now(), updated_by = auth.uid() WHERE id = _order_id;
END $$;

REVOKE ALL ON FUNCTION public.shop_place_order(uuid,uuid,jsonb,uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.shop_set_order_status(uuid,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.shop_place_order(uuid,uuid,jsonb,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.shop_set_order_status(uuid,text) TO authenticated;