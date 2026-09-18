CREATE OR REPLACE FUNCTION public.payfast_session_gateway_fee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_desc text;
BEGIN
  IF NEW.status <> 'completed' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'completed' THEN RETURN NEW; END IF;
  IF COALESCE(NEW.amount, 0) <= 0 THEN RETURN NEW; END IF;

  v_desc := COALESCE(NEW.description,
              CASE NEW.purpose
                WHEN 'topup' THEN 'Wallet top-up'
                WHEN 'tournament' THEN 'Tournament entry fee'
                ELSE 'Fee payment'
              END);

  PERFORM public.post_gateway_fee(NEW.club_id, NEW.id, NEW.amount, v_desc, NEW.club_member_id, 'card_local');
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.payfast_session_gateway_fee() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_payfast_session_gateway_fee ON public.payfast_payment_sessions;
CREATE TRIGGER trg_payfast_session_gateway_fee
AFTER INSERT OR UPDATE ON public.payfast_payment_sessions
FOR EACH ROW EXECUTE FUNCTION public.payfast_session_gateway_fee();

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id, club_id, amount, description, purpose, club_member_id
           FROM public.payfast_payment_sessions
           WHERE status = 'completed' AND COALESCE(amount,0) > 0
  LOOP
    PERFORM public.post_gateway_fee(
      r.club_id, r.id, r.amount,
      COALESCE(r.description, CASE r.purpose WHEN 'topup' THEN 'Wallet top-up' WHEN 'tournament' THEN 'Tournament entry fee' ELSE 'Fee payment' END),
      r.club_member_id, 'card_local');
  END LOOP;
END $$;