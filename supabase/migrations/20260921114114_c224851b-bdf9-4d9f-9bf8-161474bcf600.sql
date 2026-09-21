CREATE OR REPLACE FUNCTION public.visitor_charge_court_fee(p_booking_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b record;
  v_self_fee numeric;
  v_court text;
  v_role text;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id;
  IF b.id IS NULL THEN RETURN false; END IF;
  IF b.status <> 'active' THEN RETURN false; END IF;
  IF b.visitor_fee_charged_at IS NOT NULL THEN RETURN false; END IF;

  -- Only the visitor who made the booking (or a club admin) may trigger this.
  IF NOT (
    b.user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.id = b.club_member_id AND cm.user_id = auth.uid()
    )
    OR public.is_club_admin(auth.uid(), b.club_id)
  ) THEN
    RETURN false;
  END IF;

  SELECT lower(role) INTO v_role FROM public.club_members WHERE id = b.club_member_id;
  IF v_role IS DISTINCT FROM 'visitor' THEN RETURN false; END IF;

  SELECT COALESCE(visitor_self_booking_fee, 0) INTO v_self_fee
    FROM public.clubs WHERE id = b.club_id;

  IF COALESCE(v_self_fee, 0) <= 0 THEN
    UPDATE public.bookings SET visitor_fee_charged_at = now() WHERE id = b.id;
    RETURN false;
  END IF;

  SELECT name INTO v_court FROM public.courts WHERE id = b.court_id;

  INSERT INTO public.member_credit_transactions(
    user_id, club_id, club_member_id, amount, type, method, status, confirmed_at, description, reference
  ) VALUES (
    b.user_id, b.club_id, b.club_member_id, v_self_fee, 'credit', 'system', 'confirmed', now(),
    'Visitor court fee – ' || COALESCE(v_court, 'Court ' || b.court_id) || ' ' || b.date,
    b.id::text
  );

  UPDATE public.bookings SET visitor_fee_charged_at = now() WHERE id = b.id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.visitor_charge_court_fee(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.visitor_charge_court_fee(uuid) TO authenticated, service_role;