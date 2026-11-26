CREATE OR REPLACE FUNCTION public.shop_place_order(_club_member_id uuid, _bar_item_id uuid, _lines jsonb, _request_id uuid)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_club uuid; v_item record; v_line jsonb; v_n int := 0; v_name text; v_fits jsonb; v_need_name boolean;
BEGIN
  SELECT club_id INTO v_club FROM club_members WHERE id = _club_member_id AND user_id = auth.uid();
  IF v_club IS NULL THEN RAISE EXCEPTION 'Please log in again to place this order'; END IF;
  SELECT * INTO v_item FROM bar_items WHERE id = _bar_item_id AND club_id = v_club AND active AND archived_at IS NULL;
  IF v_item IS NULL OR v_item.order_options IS NULL THEN RAISE EXCEPTION 'This item cannot be ordered'; END IF;
  IF EXISTS (SELECT 1 FROM shop_orders WHERE request_id = _request_id) THEN
    RETURN (SELECT count(*) FROM shop_orders WHERE request_id = _request_id);
  END IF;
  IF jsonb_typeof(_lines) <> 'array' OR jsonb_array_length(_lines) NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Add between 1 and 20 items'; END IF;
  v_fits := v_item.order_options->'fits';
  v_need_name := coalesce((v_item.order_options->>'back_name')::boolean, true);
  FOR v_line IN SELECT * FROM jsonb_array_elements(_lines) LOOP
    v_name := btrim(coalesce(v_line->>'back_name',''));
    IF v_need_name AND char_length(v_name) NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Name on the back must be 1 to 20 characters'; END IF;
    IF NOT v_need_name THEN v_name := ''; END IF;
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_fits) f
       WHERE f->>'key' = v_line->>'fit' AND (f->'sizes') @> jsonb_build_array(v_line->>'size')) THEN
      RAISE EXCEPTION 'Please choose a valid option and size';
    END IF;
    INSERT INTO shop_orders(club_id, club_member_id, bar_item_id, request_id, fit, size, back_name, unit_price, unit_cost, status)
    VALUES (v_club, _club_member_id, _bar_item_id, _request_id, v_line->>'fit', v_line->>'size', v_name, v_item.price, v_item.cost_price, 'awaiting_payment');
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END $function$;