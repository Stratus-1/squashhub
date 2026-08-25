-- Extend booking overlap checks to cover member-scoped bookings as well as
-- legacy user-scoped rows. Self-scheduled championship matches now insert
-- club_member_id / opponent_member_id, so the booking guard must inspect those
-- fields too.

CREATE OR REPLACE FUNCTION public.prevent_booking_participant_overlaps()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  participants uuid[];
  new_range tsrange;
BEGIN
  IF NEW.status IS DISTINCT FROM 'active' THEN
    RETURN NEW;
  END IF;

  participants := array_remove(ARRAY[NEW.user_id, NEW.opponent_id, NEW.club_member_id, NEW.opponent_member_id], NULL);
  IF participants IS NULL OR array_length(participants, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  new_range := tsrange(
    (NEW.date::timestamp + NEW.start_time),
    (NEW.date::timestamp + NEW.end_time),
    '[)'
  );

  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.status = 'active'
      AND b.id <> NEW.id
      AND b.date = NEW.date
      AND tsrange((b.date::timestamp + b.start_time), (b.date::timestamp + b.end_time), '[)') && new_range
      AND (
        (b.user_id IS NOT NULL AND b.user_id = ANY(participants))
        OR (b.opponent_id IS NOT NULL AND b.opponent_id = ANY(participants))
        OR (b.club_member_id IS NOT NULL AND b.club_member_id = ANY(participants))
        OR (b.opponent_member_id IS NOT NULL AND b.opponent_member_id = ANY(participants))
      )
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'This time conflicts with an existing booking for one of the players';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_booking_participant_overlaps_trigger ON public.bookings;
CREATE TRIGGER prevent_booking_participant_overlaps_trigger
  BEFORE INSERT OR UPDATE OF status, date, start_time, end_time, user_id, opponent_id, club_member_id, opponent_member_id
  ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_booking_participant_overlaps();

CREATE OR REPLACE FUNCTION public.self_schedule_champ_match(
  p_match_id uuid,
  p_court_id integer,
  p_date date,
  p_time time without time zone,
  p_duration_minutes integer DEFAULT 45
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _m public.club_champs_matches%ROWTYPE;
  _club_id uuid;
  _champ_name text;
  _start time := p_time;
  _end time;
  _conflicts int;
  _booking_id uuid;
  _is_participant boolean;
  _can_manage boolean;
  _booker_member uuid;
  _booker_user uuid;
  _r record;
  _participants uuid[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to schedule a match' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _m FROM public.club_champs_matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT c.club_id, c.name INTO _club_id, _champ_name
  FROM public.club_champs c WHERE c.id = _m.champ_id;

  _is_participant :=
       public.is_member_owner(_m.player_a_member_id)
    OR public.is_member_owner(_m.player_b_member_id)
    OR public.is_member_owner(_m.partner_a_member_id)
    OR public.is_member_owner(_m.partner_b_member_id);
  _can_manage := public.is_club_admin_or_permitted(auth.uid(), _club_id, 'champs');

  IF NOT (_is_participant OR _can_manage) THEN
    RAISE EXCEPTION 'Only the players in this match can schedule it' USING ERRCODE = '42501';
  END IF;

  IF _m.is_bye OR _m.status IN ('completed', 'forfeited', 'walkover', 'cancelled') THEN
    RAISE EXCEPTION 'This match can no longer be scheduled' USING ERRCODE = '22023';
  END IF;

  IF _m.player_a_member_id IS NULL OR _m.player_b_member_id IS NULL THEN
    RAISE EXCEPTION 'Both players must be known before this match can be scheduled' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.courts WHERE id = p_court_id AND club_id = _club_id) THEN
    RAISE EXCEPTION 'That court does not belong to this club' USING ERRCODE = '22023';
  END IF;

  _end := _start + make_interval(mins => greatest(15, coalesce(p_duration_minutes, 45)));
  _participants := array_remove(ARRAY[
    _m.player_a_member_id,
    _m.player_b_member_id,
    _m.partner_a_member_id,
    _m.partner_b_member_id
  ], NULL);

  SELECT count(*) INTO _conflicts
  FROM public.bookings b
  WHERE b.date = p_date
    AND b.status = 'active'
    AND (_m.booking_id IS NULL OR b.id <> _m.booking_id)
    AND b.start_time < _end
    AND b.end_time > _start
    AND (
      (b.user_id IS NOT NULL AND b.user_id = ANY(_participants))
      OR (b.opponent_id IS NOT NULL AND b.opponent_id = ANY(_participants))
      OR (b.club_member_id IS NOT NULL AND b.club_member_id = ANY(_participants))
      OR (b.opponent_member_id IS NOT NULL AND b.opponent_member_id = ANY(_participants))
    );

  IF _conflicts > 0 THEN
    RAISE EXCEPTION 'One of the players already has a booking at that time — please pick another slot' USING ERRCODE = '23505';
  END IF;

  SELECT count(*) INTO _conflicts
  FROM public.bookings b
  WHERE b.court_id = p_court_id
    AND b.date = p_date
    AND b.status = 'active'
    AND (_m.booking_id IS NULL OR b.id <> _m.booking_id)
    AND b.start_time < _end
    AND b.end_time > _start;

  IF _conflicts > 0 THEN
    RAISE EXCEPTION 'That court is already booked at this time — please pick another slot' USING ERRCODE = '23505';
  END IF;

  _booker_member := _m.player_a_member_id;
  SELECT cm.user_id INTO _booker_user FROM public.club_members cm WHERE cm.id = _booker_member;

  IF _m.booking_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.bookings WHERE id = _m.booking_id) THEN
    UPDATE public.bookings
       SET court_id = p_court_id, date = p_date, start_time = _start, end_time = _end, status = 'active'
     WHERE id = _m.booking_id;
    _booking_id := _m.booking_id;
  ELSE
    INSERT INTO public.bookings (
      club_id, court_id, user_id, club_member_id, opponent_member_id,
      date, start_time, end_time, status, is_friendly, source, external_id, booking_type
    ) VALUES (
      _club_id, p_court_id, _booker_user, _booker_member, _m.player_b_member_id,
      p_date, _start, _end, 'active', false, 'club_event',
      'champ:' || _m.champ_id || ':match:' || _m.id, 'match'
    )
    RETURNING id INTO _booking_id;
  END IF;

  PERFORM set_config('app.self_schedule', '1', true);
  UPDATE public.club_champs_matches
     SET court_id = p_court_id,
         scheduled_date = p_date,
         scheduled_time = _start,
         booking_id = _booking_id,
         updated_at = now()
   WHERE id = p_match_id;
  PERFORM set_config('app.self_schedule', '', true);

  FOR _r IN
    SELECT DISTINCT cm.user_id, cm.id AS member_id
    FROM public.club_members cm
    WHERE cm.id IN (_m.player_a_member_id, _m.player_b_member_id, _m.partner_a_member_id, _m.partner_b_member_id)
      AND cm.user_id IS NOT NULL
  LOOP
    INSERT INTO public.notifications (user_id, club_member_id, title, message, type, url)
    VALUES (
      _r.user_id,
      _r.member_id,
      'Tournament match scheduled',
      coalesce(_champ_name, 'Tournament') || ' — your match is set for ' ||
        to_char(p_date, 'Dy DD Mon') || ' at ' || to_char(_start, 'HH24:MI') || '.',
      'tournament',
      '/club-champs/' || _m.champ_id
    );
  END LOOP;

  RETURN jsonb_build_object(
    'match_id', p_match_id,
    'booking_id', _booking_id,
    'court_id', p_court_id,
    'scheduled_date', p_date,
    'scheduled_time', _start
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.self_schedule_champ_match(uuid, integer, date, time without time zone, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.self_schedule_champ_match(uuid, integer, date, time without time zone, integer) TO authenticated;

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

  IF NEW.challenge_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_court_name FROM public.courts WHERE id = NEW.court_id;
  v_time_text := COALESCE(v_court_name, 'Court') || ' on ' || NEW.date::text || ' at ' || substring(NEW.start_time::text from 1 for 5);

  IF NEW.club_member_id IS NOT NULL THEN
    INSERT INTO public.notifications (club_member_id, user_id, title, message, type, url, data)
    VALUES (
      NEW.club_member_id,
      COALESCE(NEW.user_id, '00000000-0000-0000-0000-000000000000'),
      'Booking cancelled',
      'Your booking for ' || v_time_text || ' has been cancelled. Please make a new booking for the championship.',
      'booking',
      '/bookings?date=' || NEW.date::text,
      jsonb_build_object('booking_id', NEW.id)
    );
  END IF;

  IF NEW.opponent_member_id IS NOT NULL THEN
    INSERT INTO public.notifications (club_member_id, user_id, title, message, type, url, data)
    VALUES (
      NEW.opponent_member_id,
      COALESCE(NEW.opponent_id, (SELECT user_id FROM public.club_members WHERE id = NEW.opponent_member_id), '00000000-0000-0000-0000-000000000000'),
      'Booking cancelled',
      'Your booking for ' || v_time_text || ' has been cancelled. Please make a new booking for the championship.',
      'booking',
      '/bookings?date=' || NEW.date::text,
      jsonb_build_object('booking_id', NEW.id)
    );
  ELSIF NEW.opponent_id IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, title, message, type, url, data)
    VALUES (
      NEW.opponent_id,
      'Booking cancelled',
      'Your booking for ' || v_time_text || ' has been cancelled. Please make a new booking for the championship.',
      'booking',
      '/bookings?date=' || NEW.date::text,
      jsonb_build_object('booking_id', NEW.id)
    );
  END IF;

  RETURN NEW;
END;
$$;
