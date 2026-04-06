
-- Add new GL accounts for bar
ALTER TYPE public.gl_account ADD VALUE IF NOT EXISTS 'bar_income';
ALTER TYPE public.gl_account ADD VALUE IF NOT EXISTS 'bar_expense';

-- Add restock cost to bar_items (cost price vs selling price)
ALTER TABLE public.bar_items
  ADD COLUMN cost_price numeric NOT NULL DEFAULT 0;

-- Trigger: journal entry when bar tab entry is created (sale)
CREATE OR REPLACE FUNCTION public.journal_bar_sale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ref uuid;
  v_item_name text;
BEGIN
  IF NEW.club_id IS NULL THEN RETURN NEW; END IF;

  SELECT name INTO v_item_name FROM public.bar_items WHERE id = NEW.bar_item_id;
  v_ref := gen_random_uuid();

  -- Debit Debtors (member owes club)
  INSERT INTO public.club_journal_entries
    (club_id, club_member_id, account, debit, credit, description, journal_ref, created_at)
  VALUES
    (NEW.club_id, NEW.club_member_id, 'debtors', NEW.total, 0,
     'Bar sale: ' || NEW.quantity || '× ' || COALESCE(v_item_name, 'item'), v_ref, now());

  -- Credit Bar Income
  INSERT INTO public.club_journal_entries
    (club_id, club_member_id, account, debit, credit, description, journal_ref, created_at)
  VALUES
    (NEW.club_id, NEW.club_member_id, 'bar_income', 0, NEW.total,
     'Bar sale: ' || NEW.quantity || '× ' || COALESCE(v_item_name, 'item'), v_ref, now());

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_journal_bar_sale
AFTER INSERT ON public.bar_tab_entries
FOR EACH ROW
EXECUTE FUNCTION public.journal_bar_sale();

-- Table to track stock purchase events
CREATE TABLE public.bar_stock_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id),
  bar_item_id uuid NOT NULL REFERENCES public.bar_items(id),
  quantity integer NOT NULL,
  unit_cost numeric NOT NULL DEFAULT 0,
  total_cost numeric NOT NULL DEFAULT 0,
  supplier_note text,
  purchased_by uuid REFERENCES public.club_members(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bar_stock_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Club admins can manage stock purchases"
ON public.bar_stock_purchases
FOR ALL
USING (public.is_club_admin(auth.uid(), club_id))
WITH CHECK (public.is_club_admin(auth.uid(), club_id));

-- Trigger: journal entry when stock is purchased (expense)
CREATE OR REPLACE FUNCTION public.journal_bar_purchase()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ref uuid;
  v_item_name text;
BEGIN
  IF NEW.total_cost <= 0 THEN RETURN NEW; END IF;

  SELECT name INTO v_item_name FROM public.bar_items WHERE id = NEW.bar_item_id;
  v_ref := gen_random_uuid();

  -- Debit Bar Expense (stock purchase cost)
  INSERT INTO public.club_journal_entries
    (club_id, account, debit, credit, description, journal_ref, created_at)
  VALUES
    (NEW.club_id, 'bar_expense', NEW.total_cost, 0,
     'Stock purchase: ' || NEW.quantity || '× ' || COALESCE(v_item_name, 'item') || COALESCE(' — ' || NEW.supplier_note, ''), v_ref, now());

  -- Credit Creditors (club owes supplier)
  INSERT INTO public.club_journal_entries
    (club_id, account, debit, credit, description, journal_ref, created_at)
  VALUES
    (NEW.club_id, 'creditors', 0, NEW.total_cost,
     'Stock purchase: ' || NEW.quantity || '× ' || COALESCE(v_item_name, 'item') || COALESCE(' — ' || NEW.supplier_note, ''), v_ref, now());

  -- Also update stock qty on the item
  UPDATE public.bar_items
  SET stock_qty = stock_qty + NEW.quantity, updated_at = now()
  WHERE id = NEW.bar_item_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_journal_bar_purchase
AFTER INSERT ON public.bar_stock_purchases
FOR EACH ROW
EXECUTE FUNCTION public.journal_bar_purchase();
