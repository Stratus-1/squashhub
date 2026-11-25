CREATE OR REPLACE FUNCTION public.shop_set_order_status(_order_id uuid, _status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_club uuid; v_cur text;
BEGIN
  SELECT club_id, status INTO v_club, v_cur FROM shop_orders WHERE id = _order_id;
  IF v_club IS NULL OR NOT public.is_club_admin_or_permitted(auth.uid(), v_club, 'bar.stock') THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  IF _status NOT IN ('ordered','with_printer','ready','collected','cancelled') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  IF v_cur = 'awaiting_payment' AND _status <> 'cancelled' THEN
    RAISE EXCEPTION 'This shirt has not been paid yet';
  END IF;
  UPDATE shop_orders SET status = _status, updated_at = now(), updated_by = auth.uid() WHERE id = _order_id;
END $$;