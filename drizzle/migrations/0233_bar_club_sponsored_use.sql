ALTER TYPE public.gl_account ADD VALUE IF NOT EXISTS 'club_stock_expense';

CREATE OR REPLACE FUNCTION public.bar_club_use(_item uuid, _qty numeric, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE it public.bar_items%ROWTYPE; v_units int; v_cost numeric; v_ref uuid; v_desc text; v_offset text; v_mv uuid;
BEGIN
  SELECT * INTO it FROM public.bar_items WHERE id = _item;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item not found'; END IF;
  IF auth.uid() IS NULL OR NOT public.is_club_admin_or_permitted(auth.uid(), it.club_id, 'bar') THEN
    RAISE EXCEPTION 'You do not have bar permission for this club';
  END IF;
  IF it.item_kind <> 'stock' THEN RAISE EXCEPTION 'Choose the stock product, not a selling option or special'; END IF;
  IF _qty IS NULL OR _qty <= 0 THEN RAISE EXCEPTION 'Enter a quantity above zero'; END IF;
  IF COALESCE(btrim(_reason), '') = '' THEN RAISE EXCEPTION 'Enter what the club used it for'; END IF;
  v_units := round(_qty * GREATEST(COALESCE(it.unit_yield, 1), 1))::int;
  IF v_units <= 0 THEN RAISE EXCEPTION 'Enter a quantity above zero'; END IF;

  IF public.bar_allow_negative_stock(it.club_id) THEN PERFORM set_config('sh.bar_allow_negative', '1', true); END IF;
  PERFORM public.bar_stock_apply(it.id, -v_units, 'club_use', 'club_use', NULL, NULL, false);
  PERFORM set_config('sh.bar_allow_negative', '', true);

  SELECT id INTO v_mv FROM public.bar_stock_movements
   WHERE bar_item_id = it.id AND reason = 'club_use' ORDER BY created_at DESC, id DESC LIMIT 1;
  v_desc := 'Club sponsored: ' || _qty::text || ' × ' || it.name || ' — ' || btrim(_reason);
  UPDATE public.bar_stock_movements SET note = v_desc WHERE id = v_mv;

  v_cost := round(v_units * COALESCE(it.avg_unit_cost, it.cost_price / GREATEST(COALESCE(it.unit_yield,1),1), 0), 2);
  IF v_cost > 0 THEN
    v_ref := gen_random_uuid();
    v_offset := CASE WHEN COALESCE(it.division, 'bar') = 'shop' THEN 'shop_expense' ELSE 'bar_expense' END;
    INSERT INTO public.club_journal_entries (club_id, journal_ref, account, debit, credit, description) VALUES
      (it.club_id, v_ref, 'club_stock_expense'::public.gl_account, v_cost, 0, v_desc),
      (it.club_id, v_ref, v_offset::public.gl_account, 0, v_cost, v_desc);
  END IF;
  RETURN jsonb_build_object('movement_id', v_mv, 'units', v_units, 'cost', v_cost, 'journal_ref', v_ref);
END $$;

REVOKE ALL ON FUNCTION public.bar_club_use(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bar_club_use(uuid, numeric, text) TO authenticated;