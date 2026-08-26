-- Post gateway fee automatically when an online checkout session completes.
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

DROP TRIGGER IF EXISTS trg_yoco_session_gateway_fee ON public.yoco_payment_sessions;
CREATE TRIGGER trg_yoco_session_gateway_fee
AFTER INSERT OR UPDATE OF status ON public.yoco_payment_sessions
FOR EACH ROW EXECUTE FUNCTION public.payment_session_gateway_fee();

DROP TRIGGER IF EXISTS trg_stitch_session_gateway_fee ON public.stitch_payment_sessions;
CREATE TRIGGER trg_stitch_session_gateway_fee
AFTER INSERT OR UPDATE OF status ON public.stitch_payment_sessions
FOR EACH ROW EXECUTE FUNCTION public.payment_session_gateway_fee();

-- Backfill: completed online checkouts with no gateway-fee entry
DO $$
DECLARE r record; v_method text;
BEGIN
  FOR r IN
    SELECT id, club_id, club_member_id, amount, description, purpose, 'card'::text AS method
    FROM public.yoco_payment_sessions s
    WHERE s.status = 'completed' AND COALESCE(s.amount,0) > 0
      AND NOT EXISTS (SELECT 1 FROM public.club_journal_entries j
                      WHERE j.journal_ref = s.id AND j.account = 'gateway_fees'::public.gl_account)
    UNION ALL
    SELECT id, club_id, club_member_id, amount, description, purpose, COALESCE(method,'card')
    FROM public.stitch_payment_sessions s
    WHERE s.status = 'completed' AND COALESCE(s.amount,0) > 0
      AND NOT EXISTS (SELECT 1 FROM public.club_journal_entries j
                      WHERE j.journal_ref = s.id AND j.account = 'gateway_fees'::public.gl_account)
  LOOP
    v_method := CASE lower(r.method) WHEN 'card' THEN 'card_local'
                  WHEN 'capitec' THEN 'capitec' WHEN 'wallet' THEN 'wallet' ELSE NULL END;
    PERFORM public.post_gateway_fee(r.club_id, r.id, r.amount,
      COALESCE(r.description,
        CASE r.purpose WHEN 'topup' THEN 'Wallet top-up'
                       WHEN 'tournament' THEN 'Tournament entry fee'
                       ELSE 'Fee payment' END),
      r.club_member_id, v_method);
  END LOOP;
END $$;

-- Backfill: settled recurring collections with no gateway-fee entry
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.* FROM public.stitch_collections c
    WHERE c.status = 'paid' AND COALESCE(c.amount_cents,0) > 0
      AND NOT EXISTS (SELECT 1 FROM public.club_journal_entries j
                      WHERE j.journal_ref = c.id AND j.account = 'gateway_fees'::public.gl_account)
  LOOP
    PERFORM public.post_gateway_fee(r.club_id, r.id, r.amount_cents / 100.0,
      'Recurring card payment [Stitch]', r.club_member_id, NULL);
  END LOOP;
END $$;