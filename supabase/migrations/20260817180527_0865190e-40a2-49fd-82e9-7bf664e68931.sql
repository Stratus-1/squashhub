CREATE OR REPLACE FUNCTION public.bar_visitor_sale_journal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_item_name text;
  v_desc text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Card checkouts start as 'pending': do not book income until the bank
    -- confirms (handled by the AFTER UPDATE trigger below).
    IF NEW.payment_status = 'pending' THEN
      RETURN NEW;
    END IF;

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
$function$;

CREATE OR REPLACE FUNCTION public.bar_visitor_sale_journal_on_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_item_name text;
  v_desc text;
BEGIN
  IF NEW.payment_status IS NOT DISTINCT FROM OLD.payment_status THEN
    RETURN NEW;
  END IF;

  IF NEW.payment_status IN ('paid', 'recorded') THEN
    IF NOT EXISTS (SELECT 1 FROM public.club_journal_entries WHERE journal_ref = NEW.id) THEN
      SELECT name INTO v_item_name FROM public.bar_items WHERE id = NEW.bar_item_id;
      v_desc := 'Bar visitor sale (' || NEW.payment_method || '): ' || NEW.quantity::text
                || '× ' || COALESCE(v_item_name, 'item')
                || COALESCE(' — ' || NEW.visitor_name, '');

      INSERT INTO public.club_journal_entries (club_id, journal_ref, account, debit, credit, description)
      VALUES
        (NEW.club_id, NEW.id, 'bank_current', NEW.total, 0, v_desc),
        (NEW.club_id, NEW.id, 'bar_income',   0, NEW.total, v_desc);
    END IF;
  ELSIF NEW.payment_status = 'failed' THEN
    DELETE FROM public.club_journal_entries WHERE journal_ref = NEW.id;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_bar_visitor_sale_journal_status ON public.bar_visitor_sales;
CREATE TRIGGER trg_bar_visitor_sale_journal_status
AFTER UPDATE ON public.bar_visitor_sales
FOR EACH ROW EXECUTE FUNCTION public.bar_visitor_sale_journal_on_status();