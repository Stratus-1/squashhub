
-- Visitor / walk-in cash sales table for the Honesty Bar.
-- Records a paid-up-front sale (no member tab) with cash, card or EFT.
CREATE TABLE public.bar_visitor_sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  bar_item_id uuid NOT NULL REFERENCES public.bar_items(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price numeric NOT NULL,
  total numeric NOT NULL,
  payment_method text NOT NULL CHECK (payment_method IN ('cash','card','eft')),
  visitor_name text,
  note text,
  logged_by uuid REFERENCES public.club_members(id),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_bar_visitor_sales_club ON public.bar_visitor_sales(club_id, created_at DESC);

ALTER TABLE public.bar_visitor_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Club admins manage visitor sales"
  ON public.bar_visitor_sales
  FOR ALL
  TO authenticated
  USING (is_club_admin(auth.uid(), club_id))
  WITH CHECK (is_club_admin(auth.uid(), club_id));

CREATE POLICY "Super admins manage visitor sales"
  ON public.bar_visitor_sales
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Decrement stock for visitor sales (mirrors honesty bar behaviour).
CREATE OR REPLACE FUNCTION public.decrement_bar_stock_visitor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.bar_items
  SET stock_qty = GREATEST(stock_qty - NEW.quantity, 0)
  WHERE id = NEW.bar_item_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_decrement_bar_stock_visitor
AFTER INSERT ON public.bar_visitor_sales
FOR EACH ROW EXECUTE FUNCTION public.decrement_bar_stock_visitor();

-- Post GL entries: debit bank_current (cash drawer / card / EFT receivable),
-- credit bar_income for visitor sale.
CREATE OR REPLACE FUNCTION public.bar_visitor_sale_journal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item_name text;
  v_desc text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT name INTO v_item_name FROM public.bar_items WHERE id = NEW.bar_item_id;
    v_desc := 'Bar visitor sale (' || NEW.payment_method || '): ' || NEW.quantity::text
              || '× ' || COALESCE(v_item_name, 'item')
              || COALESCE(' — ' || NEW.visitor_name, '');

    INSERT INTO public.club_journal_entries (club_id, journal_ref, account, debit, credit, description)
    VALUES
      (NEW.club_id, NEW.id, 'bank_current', NEW.total, 0, v_desc),
      (NEW.club_id, NEW.id, 'bar_income',   0, NEW.total, v_desc);

    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM public.club_journal_entries WHERE journal_ref = OLD.id;
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_bar_visitor_sale_journal
AFTER INSERT OR DELETE ON public.bar_visitor_sales
FOR EACH ROW EXECUTE FUNCTION public.bar_visitor_sale_journal();
