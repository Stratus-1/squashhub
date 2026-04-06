-- Remove triggers that auto-create debtors/creditors journal entries (switching to cash-basis)

-- Bar sale trigger: was creating Dt debtors / Cr bar_income on every tab entry
DROP TRIGGER IF EXISTS trg_journal_bar_sale ON public.bar_tab_entries;

-- Light fee trigger: was creating Dt debtors / Cr fee_income on every light charge
DROP TRIGGER IF EXISTS trg_journal_light_fee ON public.member_credit_transactions;

-- Bar purchase trigger: was creating Dt bar_expense / Cr creditors AND updating stock qty
-- We need to keep the stock qty update, so replace the function
CREATE OR REPLACE FUNCTION public.journal_bar_purchase()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only update stock qty on the item (no longer creating GL journal entries)
  UPDATE public.bar_items
  SET stock_qty = stock_qty + NEW.quantity, updated_at = now()
  WHERE id = NEW.bar_item_id;

  RETURN NEW;
END;
$function$;