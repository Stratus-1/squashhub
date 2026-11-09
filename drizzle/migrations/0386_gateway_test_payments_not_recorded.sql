ALTER TABLE public.stitch_payment_sessions ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;
ALTER TABLE public.yoco_payment_sessions ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.stitch_payment_sessions.is_test IS 'Created with Stitch test/sandbox credentials. Test sessions never post fees, member credits or ledger entries.';
COMMENT ON COLUMN public.yoco_payment_sessions.is_test IS 'Created with a Yoco sk_test_ key. Test sessions never post fees, member credits or ledger entries.';

CREATE OR REPLACE FUNCTION public.payment_session_gateway_fee()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_method text;
  v_desc text;
BEGIN
  IF NEW.status <> 'completed' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.status = 'completed' THEN RETURN NEW; END IF;
  IF COALESCE(NEW.amount, 0) <= 0 THEN RETURN NEW; END IF;
  -- Sandbox payments move no real money: never book a gateway fee.
  IF COALESCE(NEW.is_test, false) THEN RETURN NEW; END IF;

  v_method := CASE lower(COALESCE(NEW.method, 'card'))
                WHEN 'card' THEN 'card_local'
                WHEN 'capitec' THEN 'capitec'
                WHEN 'wallet' THEN 'wallet'
                ELSE NULL
              END;

  v_desc := COALESCE(NEW.description,
              CASE NEW.purpose
                WHEN 'topup' THEN 'Wallet top-up'
                WHEN 'tournament' THEN 'Tournament entry fee'
                ELSE 'Fee payment'
              END);

  PERFORM public.post_gateway_fee(NEW.club_id, NEW.id, NEW.amount, v_desc, NEW.club_member_id, v_method);
  RETURN NEW;
END;
$function$;