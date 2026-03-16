
-- Update split_event_light_fees trigger to use correct terminology
-- Light fee charges to members should be type='credit' (not 'debit')
CREATE OR REPLACE FUNCTION public.split_event_light_fees()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_booking record;
  v_event record;
  v_fee_charged numeric;
  v_confirmed_count integer;
  v_share numeric;
  v_instance record;
  r record;
BEGIN
  IF NEW.status <> 'completed' OR OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  v_fee_charged := COALESCE(NEW.fee_charged, 0);
  IF v_fee_charged <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_booking FROM public.bookings WHERE id = NEW.booking_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT ce.* INTO v_event
  FROM public.club_events ce
  JOIN public.club_event_courts cec ON cec.event_id = ce.id
  WHERE ce.club_id = NEW.club_id
    AND ce.status = 'active'
    AND ce.light_fee_split = 'attendees'
    AND cec.court_id = NEW.court_id
    AND ce.start_time = v_booking.start_time
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_instance
  FROM public.club_event_instances
  WHERE event_id = v_event.id
    AND instance_date = v_booking.date
    AND status = 'scheduled'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_confirmed_count
  FROM public.club_event_instance_rsvps
  WHERE instance_id = v_instance.id
    AND status = 'confirmed';

  IF v_confirmed_count <= 0 THEN
    RETURN NEW;
  END IF;

  v_share := -1 * ROUND(v_fee_charged / v_confirmed_count, 2);

  UPDATE public.club_event_instances
  SET light_fee_total = v_fee_charged
  WHERE id = v_instance.id;

  FOR r IN
    SELECT cir.club_member_id, cm.user_id
    FROM public.club_event_instance_rsvps cir
    JOIN public.club_members cm ON cm.id = cir.club_member_id
    WHERE cir.instance_id = v_instance.id
      AND cir.status = 'confirmed'
      AND cm.user_id IS NOT NULL
  LOOP
    INSERT INTO public.member_credit_transactions (
      user_id, club_id, club_member_id, amount, type, description, status, method, confirmed_at, reference
    ) VALUES (
      r.user_id,
      NEW.club_id,
      r.club_member_id,
      v_share,
      'credit',
      'Light fee share — ' || v_event.title || ' (' || v_booking.date || ')',
      'confirmed',
      'system',
      now(),
      NEW.booking_id::text
    );
  END LOOP;

  RETURN NEW;
END;
$function$;
