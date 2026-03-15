
-- ============================================================
-- 1) Notify invited members when a club event is created
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_on_club_event_creation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event record;
  v_creator_name text;
  r record;
BEGIN
  -- Look up event details
  SELECT * INTO v_event FROM public.club_events WHERE id = NEW.event_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Get creator name
  SELECT cm.name INTO v_creator_name
  FROM public.club_members cm WHERE cm.id = v_event.booked_by_member_id;

  -- Notify all invited members (except the creator)
  FOR r IN
    SELECT cir.club_member_id
    FROM public.club_event_instance_rsvps cir
    WHERE cir.instance_id = NEW.id
      AND cir.club_member_id IS DISTINCT FROM v_event.booked_by_member_id
  LOOP
    INSERT INTO public.notifications (club_member_id, user_id, title, message, type, url, data)
    VALUES (
      r.club_member_id,
      COALESCE((SELECT user_id FROM public.club_members WHERE id = r.club_member_id), '00000000-0000-0000-0000-000000000000'),
      'Event invitation',
      COALESCE(v_creator_name, 'Your club') || ' invited you to "' || v_event.title || '" on ' || NEW.instance_date::text,
      'booking',
      '/events/' || v_event.id::text,
      jsonb_build_object('event_id', v_event.id, 'instance_id', NEW.id)
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_on_club_event_instance_create ON public.club_event_instances;
CREATE TRIGGER notify_on_club_event_instance_create
  AFTER INSERT ON public.club_event_instances
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_club_event_creation();

-- ============================================================
-- 2) Notify event organiser when someone RSVPs
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_on_event_rsvp_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_instance record;
  v_event record;
  v_member_name text;
  v_organiser_member_id uuid;
BEGIN
  -- Only fire on status change
  IF TG_OP = 'UPDATE' AND NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_instance FROM public.club_event_instances WHERE id = NEW.instance_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  SELECT * INTO v_event FROM public.club_events WHERE id = v_instance.event_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  v_organiser_member_id := v_event.booked_by_member_id;

  -- Don't notify if the organiser is the one RSVPing
  IF NEW.club_member_id = v_organiser_member_id THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_member_name FROM public.club_members WHERE id = NEW.club_member_id;

  IF v_organiser_member_id IS NOT NULL THEN
    INSERT INTO public.notifications (club_member_id, user_id, title, message, type, url, data)
    VALUES (
      v_organiser_member_id,
      COALESCE((SELECT user_id FROM public.club_members WHERE id = v_organiser_member_id), '00000000-0000-0000-0000-000000000000'),
      CASE WHEN NEW.status = 'confirmed' THEN 'RSVP confirmed' ELSE 'RSVP declined' END,
      COALESCE(v_member_name, 'A member') || CASE WHEN NEW.status = 'confirmed' THEN ' confirmed' ELSE ' declined' END || ' "' || v_event.title || '" on ' || v_instance.instance_date::text,
      'booking',
      '/events/' || v_event.id::text,
      jsonb_build_object('event_id', v_event.id, 'instance_id', v_instance.id, 'rsvp_status', NEW.status)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_on_event_rsvp_insert ON public.club_event_instance_rsvps;
CREATE TRIGGER notify_on_event_rsvp_insert
  AFTER INSERT ON public.club_event_instance_rsvps
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_event_rsvp_change();

DROP TRIGGER IF EXISTS notify_on_event_rsvp_update ON public.club_event_instance_rsvps;
CREATE TRIGGER notify_on_event_rsvp_update
  AFTER UPDATE OF status ON public.club_event_instance_rsvps
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_event_rsvp_change();

-- ============================================================
-- 3) Notify attendees when an event instance is cancelled
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_on_event_instance_cancel()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event record;
  r record;
BEGIN
  IF NEW.status <> 'cancelled' OR OLD.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_event FROM public.club_events WHERE id = NEW.event_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  FOR r IN
    SELECT cir.club_member_id
    FROM public.club_event_instance_rsvps cir
    WHERE cir.instance_id = NEW.id
      AND cir.status = 'confirmed'
  LOOP
    INSERT INTO public.notifications (club_member_id, user_id, title, message, type, url, data)
    VALUES (
      r.club_member_id,
      COALESCE((SELECT user_id FROM public.club_members WHERE id = r.club_member_id), '00000000-0000-0000-0000-000000000000'),
      'Event cancelled',
      '"' || v_event.title || '" on ' || NEW.instance_date::text || ' has been cancelled.',
      'booking',
      '/events/' || v_event.id::text,
      jsonb_build_object('event_id', v_event.id, 'instance_id', NEW.id)
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_on_event_instance_cancel ON public.club_event_instances;
CREATE TRIGGER notify_on_event_instance_cancel
  AFTER UPDATE OF status ON public.club_event_instances
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_event_instance_cancel();

-- ============================================================
-- 4) Notify opponent when a booking is created for them
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_on_booking_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booker_name text;
  v_court_name text;
  v_opponent_notify_id uuid;
BEGIN
  -- Only notify if there's an opponent
  IF NEW.opponent_member_id IS NULL AND NEW.opponent_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip challenge bookings (challenges have their own notifications)
  IF NEW.challenge_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Get booker name
  IF NEW.club_member_id IS NOT NULL THEN
    SELECT name INTO v_booker_name FROM public.club_members WHERE id = NEW.club_member_id;
  END IF;
  IF v_booker_name IS NULL AND NEW.user_id IS NOT NULL THEN
    SELECT name INTO v_booker_name FROM public.profiles WHERE id = NEW.user_id;
  END IF;

  -- Get court name
  SELECT name INTO v_court_name FROM public.courts WHERE id = NEW.court_id;

  -- Notify opponent via member_id if available
  IF NEW.opponent_member_id IS NOT NULL THEN
    INSERT INTO public.notifications (club_member_id, user_id, title, message, type, url, data)
    VALUES (
      NEW.opponent_member_id,
      COALESCE(NEW.opponent_id, (SELECT user_id FROM public.club_members WHERE id = NEW.opponent_member_id), '00000000-0000-0000-0000-000000000000'),
      'Court booked with you',
      COALESCE(v_booker_name, 'A player') || ' booked ' || COALESCE(v_court_name, 'a court') || ' on ' || NEW.date::text || ' at ' || substring(NEW.start_time::text from 1 for 5),
      'booking',
      '/bookings?date=' || NEW.date::text,
      jsonb_build_object('booking_id', NEW.id)
    );
  ELSIF NEW.opponent_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, message, type, url, data)
    VALUES (
      NEW.opponent_id,
      'Court booked with you',
      COALESCE(v_booker_name, 'A player') || ' booked ' || COALESCE(v_court_name, 'a court') || ' on ' || NEW.date::text || ' at ' || substring(NEW.start_time::text from 1 for 5),
      'booking',
      '/bookings?date=' || NEW.date::text,
      jsonb_build_object('booking_id', NEW.id)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_on_booking_created ON public.bookings;
CREATE TRIGGER notify_on_booking_created
  AFTER INSERT ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_booking_created();

-- ============================================================
-- 5) Notify both players when a booking is cancelled
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_on_booking_cancelled()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_court_name text;
  v_time_text text;
BEGIN
  IF NEW.status <> 'cancelled' OR OLD.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  -- Skip challenge bookings
  IF NEW.challenge_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_court_name FROM public.courts WHERE id = NEW.court_id;
  v_time_text := COALESCE(v_court_name, 'Court') || ' on ' || NEW.date::text || ' at ' || substring(NEW.start_time::text from 1 for 5);

  -- Notify the booker
  IF NEW.club_member_id IS NOT NULL THEN
    INSERT INTO public.notifications (club_member_id, user_id, title, message, type, url, data)
    VALUES (
      NEW.club_member_id,
      COALESCE(NEW.user_id, '00000000-0000-0000-0000-000000000000'),
      'Booking cancelled',
      'Your booking for ' || v_time_text || ' has been cancelled.',
      'booking',
      '/bookings?date=' || NEW.date::text,
      jsonb_build_object('booking_id', NEW.id)
    );
  END IF;

  -- Notify the opponent
  IF NEW.opponent_member_id IS NOT NULL THEN
    INSERT INTO public.notifications (club_member_id, user_id, title, message, type, url, data)
    VALUES (
      NEW.opponent_member_id,
      COALESCE(NEW.opponent_id, (SELECT user_id FROM public.club_members WHERE id = NEW.opponent_member_id), '00000000-0000-0000-0000-000000000000'),
      'Booking cancelled',
      'Your booking for ' || v_time_text || ' has been cancelled.',
      'booking',
      '/bookings?date=' || NEW.date::text,
      jsonb_build_object('booking_id', NEW.id)
    );
  ELSIF NEW.opponent_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, message, type, url, data)
    VALUES (
      NEW.opponent_id,
      'Booking cancelled',
      'Your booking for ' || v_time_text || ' has been cancelled.',
      'booking',
      '/bookings?date=' || NEW.date::text,
      jsonb_build_object('booking_id', NEW.id)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_on_booking_cancelled ON public.bookings;
CREATE TRIGGER notify_on_booking_cancelled
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_booking_cancelled();
