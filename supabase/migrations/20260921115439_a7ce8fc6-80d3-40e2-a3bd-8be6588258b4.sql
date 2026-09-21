
CREATE OR REPLACE FUNCTION public.tg_registration_ensure_entry_fee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only raise the entry fee once the player has actually accepted their entry.
  -- Being invited (status pending_payment with no confirmation) must never bill anyone.
  IF NEW.fee_payment_id IS NULL
     AND NEW.confirmed_at IS NOT NULL
     AND lower(COALESCE(NEW.status, '')) IN ('pending_payment', 'pending_eft') THEN
    PERFORM public.ensure_tournament_entry_fee(NEW.id);
  END IF;
  RETURN NULL;
END;
$function$;
