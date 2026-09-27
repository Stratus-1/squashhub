CREATE OR REPLACE FUNCTION public.charge_visitor_booking_fee(p_booking_id uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE b record; v_fee numeric; v_self_fee numeric; v_court text; v_role text; v_desc text;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id;
  IF b.id IS NULL THEN RETURN false; END IF;
  IF b.status <> 'active' THEN RETURN false; END IF;
  IF b.visitor_fee_charged_at IS NOT NULL THEN RETURN false; END IF;
  IF b.booking_type <> 'match' THEN RETURN false; END IF;
  -- Only direct court bookings made by a player. Club events, league and
  -- tournament blocks are never visitor bookings.
  IF b.event_id IS NOT NULL OR COALESCE(b.source,'squashhub') <> 'squashhub' THEN RETURN false; END IF;
  IF (b.date + b.start_time) > (now() AT TIME ZONE 'Africa/Johannesburg') THEN RETURN false; END IF;
  SELECT COALESCE(visitor_booking_fee,0), COALESCE(visitor_self_booking_fee,0) INTO v_fee, v_self_fee FROM public.clubs WHERE id = b.club_id;
  SELECT lower(role::text) INTO v_role FROM public.club_members WHERE id = b.club_member_id;
  SELECT name INTO v_court FROM public.courts WHERE id = b.court_id;
  IF v_role = 'visitor' THEN
    IF COALESCE(v_self_fee,0) <= 0 THEN UPDATE public.bookings SET visitor_fee_charged_at = now() WHERE id = b.id; RETURN false; END IF;
    v_fee := v_self_fee;
    v_desc := 'Visitor court fee – ' || COALESCE(v_court, 'Court ' || b.court_id) || ' ' || b.date;
  ELSE
    IF b.guest_name IS NULL OR btrim(b.guest_name) = '' THEN RETURN false; END IF;
    IF b.opponent_member_id IS NOT NULL OR b.opponent_id IS NOT NULL THEN RETURN false; END IF;
    IF COALESCE(v_fee,0) <= 0 THEN UPDATE public.bookings SET visitor_fee_charged_at = now() WHERE id = b.id; RETURN false; END IF;
    v_desc := 'Visitor fee – ' || COALESCE(b.guest_name,'visitor') || ' on ' || COALESCE(v_court, 'Court ' || b.court_id) || ' ' || b.date;
  END IF;
  INSERT INTO public.member_credit_transactions(user_id, club_id, club_member_id, amount, type, method, status, confirmed_at, description, reference)
  VALUES (b.user_id, b.club_id, b.club_member_id, v_fee, 'credit', 'system', 'confirmed', now(), v_desc, b.id::text);
  UPDATE public.bookings SET visitor_fee_charged_at = now() WHERE id = b.id;
  RETURN true;
END;
$function$;