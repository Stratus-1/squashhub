ALTER TABLE public.shop_orders DROP CONSTRAINT shop_orders_status_check;
ALTER TABLE public.shop_orders ADD CONSTRAINT shop_orders_status_check CHECK (status = ANY (ARRAY['awaiting_payment','ordered','with_printer','ready','collected','cancelled']));
ALTER TABLE public.shop_orders ALTER COLUMN status SET DEFAULT 'awaiting_payment';

-- Paid shirts = paid card/EFT sales on the member's own tabs + account charges (bar account rules already applied).
CREATE OR REPLACE FUNCTION public.shop_reconcile_order_payments(_club_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_paid int; v_used int;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT EXISTS (SELECT 1 FROM club_members WHERE club_id = _club_id AND user_id = auth.uid())
     AND NOT public.is_club_admin_or_permitted(auth.uid(), _club_id, 'bar.stock') THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  FOR r IN SELECT DISTINCT club_member_id, bar_item_id, min(created_at) AS first_at FROM shop_orders
           WHERE club_id = _club_id GROUP BY 1,2 LOOP
    SELECT coalesce((SELECT sum(s.quantity) FROM bar_visitor_sales s JOIN bar_guest_tabs t ON t.id = s.guest_tab_id
             WHERE s.club_id = _club_id AND s.bar_item_id = r.bar_item_id AND t.club_member_id = r.club_member_id
               AND s.payment_status = 'paid' AND s.created_at >= r.first_at - interval '1 hour'),0)
         + coalesce((SELECT sum(e.quantity) FROM bar_tab_entries e
             WHERE e.club_id = _club_id AND e.bar_item_id = r.bar_item_id AND e.club_member_id = r.club_member_id
               AND e.created_at >= r.first_at - interval '1 hour'),0)
      INTO v_paid;
    SELECT count(*) INTO v_used FROM shop_orders WHERE club_id = _club_id AND club_member_id = r.club_member_id
      AND bar_item_id = r.bar_item_id AND status NOT IN ('awaiting_payment','cancelled');
    IF v_paid > v_used THEN
      UPDATE shop_orders SET status = 'ordered', updated_at = now() WHERE id IN (
        SELECT id FROM shop_orders WHERE club_id = _club_id AND club_member_id = r.club_member_id
          AND bar_item_id = r.bar_item_id AND status = 'awaiting_payment' ORDER BY created_at LIMIT (v_paid - v_used));
    END IF;
  END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.shop_reconcile_order_payments(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.shop_reconcile_order_payments(uuid) TO authenticated;

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
    INSERT INTO shop_orders(club_id, club_member_id, bar_item_id, request_id, fit, size, back_name, unit_price, unit_cost, status)
    VALUES (v_club, _club_member_id, _bar_item_id, _request_id, v_line->>'fit', v_line->>'size', v_name, v_item.price, v_item.cost_price, 'awaiting_payment');
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END $$;

-- Recheck existing orders that were never moved on.
UPDATE public.shop_orders SET status = 'awaiting_payment' WHERE status = 'ordered';
DO $$ DECLARE c uuid; BEGIN
  FOR c IN SELECT DISTINCT club_id FROM public.shop_orders LOOP PERFORM public.shop_reconcile_order_payments(c); END LOOP;
END $$;