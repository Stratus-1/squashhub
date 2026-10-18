CREATE OR REPLACE FUNCTION public.bar_items_seed_avg_cost()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.avg_unit_cost IS NULL AND COALESCE(NEW.cost_price,0) > 0
     AND COALESCE(NEW.item_kind,'stock') = 'stock' AND NEW.stock_parent_id IS NULL THEN
    NEW.avg_unit_cost := round(NEW.cost_price::numeric / GREATEST(COALESCE(NEW.unit_yield,1),1), 4);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_bar_items_seed_avg_cost ON public.bar_items;
CREATE TRIGGER trg_bar_items_seed_avg_cost BEFORE INSERT OR UPDATE OF cost_price, avg_unit_cost, unit_yield ON public.bar_items
FOR EACH ROW EXECUTE FUNCTION public.bar_items_seed_avg_cost();
UPDATE public.bar_items SET avg_unit_cost = round(cost_price::numeric / GREATEST(COALESCE(unit_yield,1),1), 4)
WHERE avg_unit_cost IS NULL AND COALESCE(cost_price,0) > 0 AND COALESCE(item_kind,'stock') = 'stock' AND stock_parent_id IS NULL;