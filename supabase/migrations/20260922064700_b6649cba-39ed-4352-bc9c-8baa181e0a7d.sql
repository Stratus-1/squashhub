CREATE OR REPLACE FUNCTION public.booking_visitor_entitled(p_user_id uuid, p_club_id uuid, p_club_member_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_member_id uuid;
  v_role text;
  v_offers_pass boolean;
BEGIN
  IF p_club_id IS NULL OR p_user_id IS NULL THEN RETURN true; END IF;
  IF public.is_club_admin(p_user_id, p_club_id) OR public.is_platform_admin(p_user_id) THEN RETURN true; END IF;

  v_member_id := p_club_member_id;
  IF v_member_id IS NULL THEN
    SELECT id INTO v_member_id FROM public.club_members
     WHERE club_id = p_club_id AND user_id = p_user_id
     ORDER BY joined_at NULLS LAST LIMIT 1;
  END IF;
  IF v_member_id IS NULL THEN RETURN true; END IF;

  SELECT lower(role::text) INTO v_role FROM public.club_members WHERE id = v_member_id;
  IF v_role IS DISTINCT FROM 'visitor' THEN RETURN true; END IF;

  IF public.has_active_visitor_pass(v_member_id) THEN RETURN true; END IF;

  -- The club offers no visitor pass at all: fall back to the club's own
  -- visitors-can-book switch so visitor booking is not blocked by a pass that
  -- cannot be bought.
  SELECT EXISTS (
    SELECT 1 FROM public.member_fee_categories
    WHERE club_id = p_club_id AND visitor_pass_kind IS NOT NULL AND active
  ) INTO v_offers_pass;

  IF NOT v_offers_pass THEN
    RETURN COALESCE((SELECT visitors_can_book FROM public.clubs WHERE id = p_club_id), false);
  END IF;

  RETURN false;
END; $function$;

CREATE OR REPLACE FUNCTION public.visitor_charge_court_fee(p_booking_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  SELECT lower(role::text) INTO v_role FROM public.club_members WHERE id = b.club_member_id;
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
$function$;