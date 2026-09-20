CREATE OR REPLACE FUNCTION public.booking_notice_data(p_booking public.bookings)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_channels text[];
  v_club_channels text[];
BEGIN
  SELECT c.booking_confirm_channels INTO v_club_channels
    FROM public.clubs c WHERE c.id = p_booking.club_id;

  v_channels := COALESCE(
    NULLIF(p_booking.notify_channels, '{}'),
    NULLIF(v_club_channels, '{}'),
    ARRAY['inapp']::text[]
  );

  RETURN jsonb_build_object('booking_id', p_booking.id)
       || CASE WHEN 'email' = ANY(v_channels)
               THEN '{}'::jsonb
               ELSE jsonb_build_object('suppress_email', 'true') END;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_booking_created()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booker_name text;
  v_court_name text;
  v_data jsonb;
BEGIN
  IF NEW.opponent_member_id IS NULL AND NEW.opponent_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.challenge_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.club_member_id IS NOT NULL THEN
    SELECT name INTO v_booker_name FROM public.club_members WHERE id = NEW.club_member_id;
  END IF;
  IF v_booker_name IS NULL AND NEW.user_id IS NOT NULL THEN
    SELECT name INTO v_booker_name FROM public.profiles WHERE id = NEW.user_id;
  END IF;

  SELECT name INTO v_court_name FROM public.courts WHERE id = NEW.court_id;

  v_data := public.booking_notice_data(NEW);

  IF NEW.opponent_member_id IS NOT NULL THEN
    INSERT INTO public.notifications (club_member_id, user_id, title, message, type, url, data)
    VALUES (
      NEW.opponent_member_id,
      COALESCE(NEW.opponent_id, (SELECT user_id FROM public.club_members WHERE id = NEW.opponent_member_id), '00000000-0000-0000-0000-000000000000'),
      'Court booked with you',
      COALESCE(v_booker_name, 'A player') || ' booked ' || COALESCE(v_court_name, 'a court') || ' on ' || NEW.date::text || ' at ' || substring(NEW.start_time::text from 1 for 5),
      'booking',
      '/bookings?date=' || NEW.date::text,
      v_data
    );
  ELSIF NEW.opponent_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, message, type, url, data)
    VALUES (
      NEW.opponent_id,
      'Court booked with you',
      COALESCE(v_booker_name, 'A player') || ' booked ' || COALESCE(v_court_name, 'a court') || ' on ' || NEW.date::text || ' at ' || substring(NEW.start_time::text from 1 for 5),
      'booking',
      '/bookings?date=' || NEW.date::text,
      v_data
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_on_booking_cancelled()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_court_name text;
  v_time_text text;
  v_data jsonb;
BEGIN
  IF NEW.status <> 'cancelled' OR OLD.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  IF NEW.challenge_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_court_name FROM public.courts WHERE id = NEW.court_id;
  v_time_text := COALESCE(v_court_name, 'Court') || ' on ' || NEW.date::text || ' at ' || substring(NEW.start_time::text from 1 for 5);
  v_data := public.booking_notice_data(NEW);

  IF NEW.club_member_id IS NOT NULL THEN
    INSERT INTO public.notifications (club_member_id, user_id, title, message, type, url, data)
    VALUES (
      NEW.club_member_id,
      COALESCE(NEW.user_id, '00000000-0000-0000-0000-000000000000'),
      'Booking cancelled',
      'Your booking for ' || v_time_text || ' has been cancelled.',
      'booking',
      '/bookings?date=' || NEW.date::text,
      v_data
    );
  END IF;

  IF NEW.opponent_member_id IS NOT NULL THEN
    INSERT INTO public.notifications (club_member_id, user_id, title, message, type, url, data)
    VALUES (
      NEW.opponent_member_id,
      COALESCE(NEW.opponent_id, (SELECT user_id FROM public.club_members WHERE id = NEW.opponent_member_id), '00000000-0000-0000-0000-000000000000'),
      'Booking cancelled',
      'Your booking for ' || v_time_text || ' has been cancelled.',
      'booking',
      '/bookings?date=' || NEW.date::text,
      v_data
    );
  ELSIF NEW.opponent_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, message, type, url, data)
    VALUES (
      NEW.opponent_id,
      'Booking cancelled',
      'Your booking for ' || v_time_text || ' has been cancelled.',
      'booking',
      '/bookings?date=' || NEW.date::text,
      v_data
    );
  END IF;

  RETURN NEW;
END;
$$;