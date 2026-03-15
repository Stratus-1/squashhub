
-- Fix: the trigger was inserting positive amounts for debits, should be negative
CREATE OR REPLACE FUNCTION public.split_event_light_fees()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_booking record;
  v_event record;
  v_fee_charged numeric;
  v_confirmed_count integer;
  v_share numeric;
  v_instance record;
  r record;
BEGIN
  -- Only trigger when session is completed
  IF NEW.status <> 'completed' OR OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  v_fee_charged := COALESCE(NEW.fee_charged, 0);
  IF v_fee_charged <= 0 THEN
    RETURN NEW;
  END IF;

  -- Find the booking for this light session
  SELECT * INTO v_booking FROM public.bookings WHERE id = NEW.booking_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Check if this booking's date+time matches any event instance with light_fee_split = 'attendees'
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

  -- Find the matching instance for this date
  SELECT * INTO v_instance
  FROM public.club_event_instances
  WHERE event_id = v_event.id
    AND instance_date = v_booking.date
    AND status = 'scheduled'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Count confirmed attendees for this instance
  SELECT COUNT(*) INTO v_confirmed_count
  FROM public.club_event_instance_rsvps
  WHERE instance_id = v_instance.id
    AND status = 'confirmed';

  IF v_confirmed_count <= 0 THEN
    RETURN NEW;
  END IF;

  -- Calculate each person's share (negative = debit)
  v_share := -1 * ROUND(v_fee_charged / v_confirmed_count, 2);

  -- Update instance with the total fee
  UPDATE public.club_event_instances
  SET light_fee_total = v_fee_charged
  WHERE id = v_instance.id;

  -- Create a debit for each confirmed attendee
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
      'debit',
      'Light fee share — ' || v_event.title || ' (' || v_booking.date || ')',
      'confirmed',
      'system',
      now(),
      NEW.booking_id::text
    );
  END LOOP;

  RETURN NEW;
END;
$$;
