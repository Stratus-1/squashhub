ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS visitor_self_booking_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS require_visitor_for_member_booking boolean NOT NULL DEFAULT false;

GRANT SELECT (visitor_self_booking_fee, require_visitor_for_member_booking) ON public.clubs TO anon;

CREATE OR REPLACE FUNCTION public.charge_visitor_booking_fee(p_booking_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b record;
  v_fee numeric;
  v_self_fee numeric;
  v_court text;
  v_role text;
  v_desc text;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id;
  IF b.id IS NULL THEN RETURN false; END IF;
  IF b.status <> 'active' THEN RETURN false; END IF;
  IF b.visitor_fee_charged_at IS NOT NULL THEN RETURN false; END IF;
  IF b.booking_type <> 'match' THEN RETURN false; END IF;
  IF (b.date + b.end_time) > now() THEN RETURN false; END IF;

  SELECT COALESCE(visitor_booking_fee, 0), COALESCE(visitor_self_booking_fee, 0)
    INTO v_fee, v_self_fee
    FROM public.clubs WHERE id = b.club_id;

  SELECT lower(role) INTO v_role FROM public.club_members WHERE id = b.club_member_id;

  SELECT name INTO v_court FROM public.courts WHERE id = b.court_id;

  IF v_role = 'visitor' THEN
    -- The visitor booked the court themselves: charge their own visit fee.
    IF COALESCE(v_self_fee, 0) <= 0 THEN
      UPDATE public.bookings SET visitor_fee_charged_at = now() WHERE id = b.id;
      RETURN false;
    END IF;
    v_fee := v_self_fee;
    v_desc := 'Visitor court fee – ' || COALESCE(v_court, 'Court ' || b.court_id) || ' ' || b.date;
  ELSE
    -- A member brought a visitor: only when no member opponent was named.
    IF b.guest_name IS NULL OR btrim(b.guest_name) = '' THEN RETURN false; END IF;
    IF b.opponent_member_id IS NOT NULL OR b.opponent_id IS NOT NULL THEN RETURN false; END IF;
    IF COALESCE(v_fee, 0) <= 0 THEN
      UPDATE public.bookings SET visitor_fee_charged_at = now() WHERE id = b.id;
      RETURN false;
    END IF;
    v_desc := 'Visitor fee – ' || COALESCE(b.guest_name, 'visitor') || ' on ' || COALESCE(v_court, 'Court ' || b.court_id) || ' ' || b.date;
  END IF;

  INSERT INTO public.member_credit_transactions(
    user_id, club_id, club_member_id, amount, type, method, status, confirmed_at, description, reference
  ) VALUES (
    b.user_id, b.club_id, b.club_member_id, v_fee, 'credit', 'system', 'confirmed', now(), v_desc, b.id::text
  );

  UPDATE public.bookings SET visitor_fee_charged_at = now() WHERE id = b.id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.charge_visitor_booking_fee(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.charge_visitor_booking_fee(uuid) TO service_role;