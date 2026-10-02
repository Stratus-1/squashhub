CREATE OR REPLACE FUNCTION public.self_schedule_champ_match(p_match_id uuid, p_court_id integer, p_date date, p_time time without time zone, p_duration_minutes integer DEFAULT 45)
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
  _booking_external_id text;
  _is_participant boolean;
  _can_manage boolean;
  _booker_member uuid;
  _booker_user uuid;
  _r record;
  _participants uuid[];
  _venue_club uuid;
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

  -- Same resolver as the booking window and the court guard (owner is never venue).
  IF NOT (p_court_id = ANY(public.tournament_bookable_court_ids(_m.champ_id, _m.stage,
          (SELECT r.label FROM public.club_champs_rounds r WHERE r.id = _m.round_id)))) THEN
    IF public.tournament_event_kind(_m.champ_id) = 'regional' AND cardinality(public.tournament_host_club_ids(_m.champ_id)) = 0 THEN
      RAISE EXCEPTION 'venue_not_set: the organiser must choose the host club/venue first' USING ERRCODE = '22023';
    END IF;
    RAISE EXCEPTION 'court_not_selected: this court is not one of the tournament''s courts' USING ERRCODE = '22023';
  END IF;
  -- The booking goes in the venue club's diary.
  SELECT c.club_id INTO _venue_club FROM public.courts c WHERE c.id = p_court_id;

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

  -- Moving to another venue: free the old venue's slot (never leave a stale reservation).
  IF _m.booking_id IS NOT NULL THEN
    UPDATE public.bookings SET status = 'cancelled' WHERE id = _m.booking_id AND club_id <> _venue_club;
  END IF;

  _booker_member := _m.player_a_member_id;
  SELECT cm.user_id INTO _booker_user FROM public.club_members cm WHERE cm.id = _booker_member;
  _booking_external_id := 'champ:' || _m.champ_id || ':match:' || _m.id;

  INSERT INTO public.bookings (
    club_id, court_id, user_id, club_member_id, opponent_member_id,
    date, start_time, end_time, status, is_friendly, source, external_id, booking_type
  ) VALUES (
    _venue_club, p_court_id, _booker_user, _booker_member, _m.player_b_member_id,
    p_date, _start, _end, 'active', false, 'club_event',
    _booking_external_id, 'match'
  )
  ON CONFLICT (club_id, source, external_id) DO UPDATE
    SET court_id = EXCLUDED.court_id,
        user_id = EXCLUDED.user_id,
        club_member_id = EXCLUDED.club_member_id,
        opponent_member_id = EXCLUDED.opponent_member_id,
        date = EXCLUDED.date,
        start_time = EXCLUDED.start_time,
        end_time = EXCLUDED.end_time,
        status = EXCLUDED.status,
        is_friendly = EXCLUDED.is_friendly,
        booking_type = EXCLUDED.booking_type,
        guest_name = COALESCE(EXCLUDED.guest_name, public.bookings.guest_name)
  RETURNING id INTO _booking_id;

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