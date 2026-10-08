ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS free_visitor_bookings_per_year integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.charge_visitor_booking_fee(p_booking_id uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE b record; v_fee numeric; v_self_fee numeric; v_court text; v_role text; v_desc text; v_free int; v_used int;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = p_booking_id;
  IF b.id IS NULL THEN RETURN false; END IF;
  IF b.status <> 'active' THEN RETURN false; END IF;
  IF b.visitor_fee_charged_at IS NOT NULL THEN RETURN false; END IF;
  IF b.booking_type <> 'match' THEN RETURN false; END IF;
  IF b.event_id IS NOT NULL OR COALESCE(b.source,'squashhub') <> 'squashhub' THEN RETURN false; END IF;
  IF (b.date + b.start_time) > (now() AT TIME ZONE 'Africa/Johannesburg') THEN RETURN false; END IF;
  SELECT COALESCE(visitor_booking_fee,0), COALESCE(visitor_self_booking_fee,0), COALESCE(free_visitor_bookings_per_year,0)
    INTO v_fee, v_self_fee, v_free FROM public.clubs WHERE id = b.club_id;
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
    -- Free visitor bookings per member per calendar year: count this member's
    -- earlier visitor bookings in the same calendar year (full history).
    IF v_free > 0 THEN
      SELECT count(*) INTO v_used FROM public.bookings o
      WHERE o.club_id = b.club_id AND o.club_member_id = b.club_member_id AND o.id <> b.id
        AND o.status = 'active' AND o.booking_type = 'match' AND o.event_id IS NULL
        AND COALESCE(o.source,'squashhub') = 'squashhub'
        AND o.guest_name IS NOT NULL AND btrim(o.guest_name) <> ''
        AND o.opponent_member_id IS NULL AND o.opponent_id IS NULL
        AND extract(year FROM o.date) = extract(year FROM b.date)
        AND (o.date, o.start_time, o.id) < (b.date, b.start_time, b.id);
      IF v_used < v_free THEN
        UPDATE public.bookings SET visitor_fee_charged_at = now() WHERE id = b.id;
        RETURN false;
      END IF;
    END IF;
    v_desc := 'Visitor fee – ' || COALESCE(b.guest_name,'visitor') || ' on ' || COALESCE(v_court, 'Court ' || b.court_id) || ' ' || b.date;
  END IF;
  INSERT INTO public.member_credit_transactions(user_id, club_id, club_member_id, amount, type, method, status, confirmed_at, description, reference)
  VALUES (b.user_id, b.club_id, b.club_member_id, v_fee, 'credit', 'system', 'confirmed', now(), v_desc, b.id::text);
  UPDATE public.bookings SET visitor_fee_charged_at = now() WHERE id = b.id;
  RETURN true;
END;
$function$;