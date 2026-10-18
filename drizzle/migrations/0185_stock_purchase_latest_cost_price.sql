CREATE OR REPLACE FUNCTION public.journal_bar_purchase()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE it public.bar_items%ROWTYPE; v_units int; v_total numeric;
BEGIN
  SELECT * INTO it FROM public.bar_items WHERE id = NEW.bar_item_id;
  IF NOT FOUND OR it.club_id <> NEW.club_id THEN RAISE EXCEPTION 'Item does not belong to this club'; END IF;
  IF it.item_kind <> 'stock' THEN RAISE EXCEPTION 'Record purchases against the stock product, not a selling option or special'; END IF;
  v_units := COALESCE(NEW.quantity_units, NEW.quantity * it.unit_yield);
  v_total := COALESCE(NULLIF(NEW.total_cost, 0), NEW.unit_cost * NEW.quantity);
  PERFORM public.bar_stock_apply(it.id, v_units, 'purchase', 'bar_stock_purchases', NEW.id, NULL, true,
    CASE WHEN v_units > 0 AND v_total IS NOT NULL AND v_total > 0 THEN v_total / v_units END);
  IF v_units > 0 AND v_total IS NOT NULL AND v_total > 0 THEN
    UPDATE public.bar_items SET cost_price = (v_total / v_units) * GREATEST(COALESCE(it.unit_yield, 1), 1)
    WHERE id = it.id AND club_id = NEW.club_id;
  END IF;
  RETURN NEW;
END;
$$;
COMMENT ON FUNCTION public.journal_bar_purchase() IS 'Records receipt once through bar_stock_apply and maintains latest received invoice cost per purchase unit. Average costing remains club opt-in; historical sale snapshots are never rewritten.';