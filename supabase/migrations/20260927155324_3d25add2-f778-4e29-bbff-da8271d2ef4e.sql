ALTER TABLE public.bar_stock_purchases ADD COLUMN IF NOT EXISTS quantity_units integer CHECK (quantity_units IS NULL OR quantity_units > 0);
ALTER TABLE public.bar_items ADD COLUMN IF NOT EXISTS stock_measure text NOT NULL DEFAULT 'count' CHECK (stock_measure IN ('count','bottle','volume'));
UPDATE public.bar_items SET stock_measure = 'bottle' WHERE unit_yield > 1 AND stock_measure = 'count';

CREATE OR REPLACE FUNCTION public.journal_bar_purchase()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE it public.bar_items%ROWTYPE;
BEGIN
  SELECT * INTO it FROM public.bar_items WHERE id = NEW.bar_item_id;
  IF NOT FOUND OR it.club_id <> NEW.club_id THEN RAISE EXCEPTION 'Item does not belong to this club'; END IF;
  IF it.item_kind <> 'stock' THEN RAISE EXCEPTION 'Record purchases against the stock product, not a selling option or special'; END IF;
  PERFORM public.bar_stock_apply(it.id, COALESCE(NEW.quantity_units, NEW.quantity * it.unit_yield), 'purchase', 'bar_stock_purchases', NEW.id, NULL, true);
  RETURN NEW;
END $function$;