CREATE OR REPLACE FUNCTION public.enforce_bar_tab_pricing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item RECORD;
  is_admin boolean;
BEGIN
  SELECT id, club_id, price INTO item FROM public.bar_items WHERE id = NEW.bar_item_id;
  IF item.id IS NULL THEN
    RAISE EXCEPTION 'Unknown bar item';
  END IF;
  IF item.club_id <> NEW.club_id THEN
    RAISE EXCEPTION 'Bar item does not belong to this club';
  END IF;

  IF NEW.quantity IS NULL OR NEW.quantity < 1 THEN
    RAISE EXCEPTION 'Quantity must be at least 1';
  END IF;

  is_admin := public.is_club_admin(auth.uid(), NEW.club_id);

  IF NOT is_admin THEN
    NEW.unit_price := item.price;
  ELSE
    NEW.unit_price := COALESCE(NEW.unit_price, item.price);
  END IF;

  NEW.total := ROUND(NEW.unit_price * NEW.quantity, 2);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS a_enforce_bar_tab_pricing ON public.bar_tab_entries;
CREATE TRIGGER a_enforce_bar_tab_pricing
BEFORE INSERT OR UPDATE OF quantity, unit_price, total, bar_item_id ON public.bar_tab_entries
FOR EACH ROW EXECUTE FUNCTION public.enforce_bar_tab_pricing();