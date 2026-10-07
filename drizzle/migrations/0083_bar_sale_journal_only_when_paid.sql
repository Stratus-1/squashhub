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
    -- Only post to the ledger once money has actually been received.
    -- 'pending' (online checkout started) and 'on_tab' (open guest tab)
    -- must not touch the bank account.
    IF NEW.payment_status NOT IN ('paid', 'recorded') THEN
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

    IF NEW.payment_method = 'card' THEN
      PERFORM public.post_gateway_fee(NEW.club_id, NEW.id, NEW.total, v_desc);
    END IF;

    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM public.club_journal_entries WHERE journal_ref = OLD.id;
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;