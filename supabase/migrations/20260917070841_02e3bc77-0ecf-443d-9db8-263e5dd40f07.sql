ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS booking_confirm_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS booking_confirm_channels text[] NOT NULL DEFAULT ARRAY['inapp']::text[],
  ADD COLUMN IF NOT EXISTS booking_reminder_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS booking_reminder_channels text[] NOT NULL DEFAULT ARRAY['inapp']::text[],
  ADD COLUMN IF NOT EXISTS booking_reminder_hours integer NOT NULL DEFAULT 24;

ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS notify_channels text[],
  ADD COLUMN IF NOT EXISTS reminder_hours integer,
  ADD COLUMN IF NOT EXISTS confirm_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS visitor_fee_charged_at timestamptz;

ALTER TABLE public.club_visitors
  ADD COLUMN IF NOT EXISTS visitor_fee_due numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS visitor_fee_charged_at timestamptz;

-- Walk-in visitor registering at a club owes the club's visitor fee.
CREATE OR REPLACE FUNCTION public.club_visitor_seed_fee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_fee numeric;
BEGIN
  SELECT COALESCE(visitor_booking_fee, 0) INTO v_fee FROM public.clubs WHERE id = NEW.club_id;
  IF COALESCE(v_fee, 0) > 0 THEN
    NEW.visitor_fee_due := v_fee;
    NEW.visitor_fee_charged_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_club_visitor_seed_fee ON public.club_visitors;
CREATE TRIGGER trg_club_visitor_seed_fee
BEFORE INSERT ON public.club_visitors
FOR EACH ROW EXECUTE FUNCTION public.club_visitor_seed_fee();

-- Charge the club's visitor fee to the booking member, once, after the slot.
CREATE OR REPLACE FUNCTION public.charge_visitor_booking_fee(p_booking_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b record;
  v_fee numeric;
  v_court text;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id;
  IF b.id IS NULL THEN RETURN false; END IF;
  IF b.status <> 'active' THEN RETURN false; END IF;
  IF b.visitor_fee_charged_at IS NOT NULL THEN RETURN false; END IF;
  IF b.guest_name IS NULL OR btrim(b.guest_name) = '' THEN RETURN false; END IF;
  IF b.opponent_member_id IS NOT NULL OR b.opponent_id IS NOT NULL THEN RETURN false; END IF;
  IF b.booking_type <> 'match' THEN RETURN false; END IF;
  IF (b.date + b.end_time) > now() THEN RETURN false; END IF;

  SELECT COALESCE(visitor_booking_fee, 0) INTO v_fee FROM public.clubs WHERE id = b.club_id;
  IF COALESCE(v_fee, 0) <= 0 THEN
    UPDATE public.bookings SET visitor_fee_charged_at = now() WHERE id = b.id;
    RETURN false;
  END IF;

  SELECT name INTO v_court FROM public.courts WHERE id = b.court_id;

  INSERT INTO public.member_credit_transactions(
    user_id, club_id, club_member_id, amount, type, method, status, confirmed_at, description, reference
  ) VALUES (
    b.user_id, b.club_id, b.club_member_id, v_fee, 'credit', 'system', 'confirmed', now(),
    'Visitor fee – ' || COALESCE(b.guest_name, 'visitor') || ' on ' || COALESCE(v_court, 'Court ' || b.court_id) || ' ' || b.date,
    b.id::text
  );

  UPDATE public.bookings SET visitor_fee_charged_at = now() WHERE id = b.id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.charge_visitor_booking_fee(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.charge_visitor_booking_fee(uuid) TO service_role;