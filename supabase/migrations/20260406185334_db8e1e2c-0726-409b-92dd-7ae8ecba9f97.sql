
-- Add stock columns to bar_items
ALTER TABLE public.bar_items
  ADD COLUMN stock_qty integer NOT NULL DEFAULT 0,
  ADD COLUMN low_stock_threshold integer NOT NULL DEFAULT 5;

-- Trigger to decrement stock on bar_tab_entries insert
CREATE OR REPLACE FUNCTION public.decrement_bar_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.bar_items
  SET stock_qty = GREATEST(stock_qty - NEW.quantity, 0),
      updated_at = now()
  WHERE id = NEW.bar_item_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_decrement_bar_stock
AFTER INSERT ON public.bar_tab_entries
FOR EACH ROW
EXECUTE FUNCTION public.decrement_bar_stock();
