ALTER TABLE public.club_champs_matches
  ADD COLUMN IF NOT EXISTS booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL;

-- Allow the self-scheduling RPC (SECURITY DEFINER) to change court/date/time
-- for participants, while the normal guard still blocks direct client writes.
CREATE OR REPLACE FUNCTION public.guard_champ_match_participant_scoring_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _club_id uuid;
  _is_allowed_marker boolean;
BEGIN
  IF coalesce(current_setting('app.self_schedule', true), '') = '1' THEN
    RETURN NEW;
  END IF;

  SELECT c.club_id INTO _club_id
  FROM public.club_champs c
  WHERE c.id = OLD.champ_id;

  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_club_admin_or_permitted(auth.uid(), _club_id, 'champs') THEN
    RETURN NEW;
  END IF;

  _is_allowed_marker :=
    public.is_club_member(auth.uid(), _club_id)
    OR public.is_member_owner(OLD.player_a_member_id)
    OR public.is_member_owner(OLD.player_b_member_id)
    OR public.is_member_owner(OLD.partner_a_member_id)
    OR public.is_member_owner(OLD.partner_b_member_id);

  IF NOT _is_allowed_marker THEN
    RETURN NEW;
  END IF;

  IF NEW.champ_id IS DISTINCT FROM OLD.champ_id
    OR NEW.group_number IS DISTINCT FROM OLD.group_number
    OR NEW.round_number IS DISTINCT FROM OLD.round_number
    OR NEW.player_a_member_id IS DISTINCT FROM OLD.player_a_member_id
    OR NEW.player_b_member_id IS DISTINCT FROM OLD.player_b_member_id
    OR NEW.partner_a_member_id IS DISTINCT FROM OLD.partner_a_member_id
    OR NEW.partner_b_member_id IS DISTINCT FROM OLD.partner_b_member_id
    OR NEW.scheduled_date IS DISTINCT FROM OLD.scheduled_date
    OR NEW.scheduled_time IS DISTINCT FROM OLD.scheduled_time
    OR NEW.court_id IS DISTINCT FROM OLD.court_id
    OR NEW.leg IS DISTINCT FROM OLD.leg
    OR NEW.is_bye IS DISTINCT FROM OLD.is_bye
    OR NEW.bye_member_id IS DISTINCT FROM OLD.bye_member_id
    OR NEW.handicap_a IS DISTINCT FROM OLD.handicap_a
    OR NEW.handicap_b IS DISTINCT FROM OLD.handicap_b
    OR NEW.handicap_locked IS DISTINCT FROM OLD.handicap_locked
    OR NEW.pool_number IS DISTINCT FROM OLD.pool_number
    OR NEW.stage IS DISTINCT FROM OLD.stage
    OR NEW.stage_label IS DISTINCT FROM OLD.stage_label
    OR NEW.bracket_position IS DISTINCT FROM OLD.bracket_position
    OR NEW.placeholder_a IS DISTINCT FROM OLD.placeholder_a
    OR NEW.placeholder_b IS DISTINCT FROM OLD.placeholder_b
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Club members can only update scores for tournament matches'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

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