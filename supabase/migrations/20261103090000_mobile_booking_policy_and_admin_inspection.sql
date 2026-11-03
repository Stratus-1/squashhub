-- Keep the Player API booking writer aligned with the club booking policy.
-- GCP/Firebase is the only mobile client entry point; these SECURITY DEFINER
-- functions are callable only with the existing internal sync secret.

CREATE OR REPLACE FUNCTION public.mobile_player_club_context(p_sync_secret text, p_club_id uuid, p_member_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_club public.clubs%ROWTYPE;
BEGIN
  IF NOT public.mobile_internal_secret_ok(p_sync_secret) THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.club_members WHERE id=p_member_id AND club_id=p_club_id) THEN RAISE EXCEPTION 'Member does not belong to selected club' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_club FROM public.clubs WHERE id=p_club_id LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Club not found' USING ERRCODE='P0002'; END IF;
  RETURN jsonb_build_object(
    'club', jsonb_build_object('id',v_club.id,'name',v_club.name,'logo_url',v_club.logo_url,'subdomain',v_club.subdomain,
      'tenant_type',v_club.tenant_type,'honesty_bar_enabled',COALESCE(v_club.honesty_bar_enabled,false),
      'booking_slot_minutes',v_club.booking_slot_minutes,'booking_open_time',v_club.booking_open_time,'booking_last_slot_time',v_club.booking_last_slot_time,
      'peak_weekday_start',v_club.peak_weekday_start,'peak_weekday_end',v_club.peak_weekday_end,'peak_weekend_start',v_club.peak_weekend_start,'peak_weekend_end',v_club.peak_weekend_end,
      'peak_day_overrides',v_club.peak_day_overrides,'max_bookings_per_day',v_club.max_bookings_per_day,'max_peak_bookings_per_day',v_club.max_peak_bookings_per_day,
      'block_back_to_back_bookings',COALESCE(v_club.block_back_to_back_bookings,false),'allow_solo_bookings',COALESCE(v_club.allow_solo_bookings,true),
      'require_visitor_for_member_booking',COALESCE(v_club.require_visitor_for_member_booking,false),'visitors_can_book',COALESCE(v_club.visitors_can_book,false),
      'visitor_booking_fee',COALESCE(v_club.visitor_booking_fee,0),'participation_active',COALESCE(v_club.participation_active,false),
      'currency_symbol',COALESCE(v_club.currency_symbol,'R')),
    'features',jsonb_build_object(
      'bookings',public.club_has_capability(p_club_id,'bookings'),
      'bar',public.club_has_capability(p_club_id,'bar') AND COALESCE(v_club.honesty_bar_enabled,false),
      'events',public.club_has_capability(p_club_id,'events'),
      'leagues',public.club_has_capability(p_club_id,'leagues'),
      'tournaments',public.club_has_capability(p_club_id,'tournaments'),
      'association',COALESCE(v_club.tenant_type,'club')='association'));
END; $$;
REVOKE ALL ON FUNCTION public.mobile_player_club_context(text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mobile_player_club_context(text,uuid,uuid) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.mobile_booking_assert_ready(text, uuid, uuid, integer, date, time, integer, uuid, uuid);

CREATE FUNCTION public.mobile_booking_assert_ready(
  p_sync_secret text,
  p_club_id uuid,
  p_member_id uuid,
  p_court_id integer,
  p_date date,
  p_start_time time,
  p_duration_minutes integer,
  p_opponent_member_id uuid DEFAULT NULL,
  p_ignore_booking_id uuid DEFAULT NULL,
  p_guest_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_member public.club_members%ROWTYPE;
  v_opponent public.club_members%ROWTYPE;
  v_club public.clubs%ROWTYPE;
  v_court public.courts%ROWTYPE;
  v_end_time time;
  v_member_status text;
  v_member_role text;
  v_is_access_suspended boolean;
  v_opponent_is_access_suspended boolean;
  v_booking_suspension_enabled boolean;
  v_booking_suspension_blocks jsonb;
  v_balance jsonb;
  v_guest_name text;
  v_daily_count integer;
  v_max_daily integer;
  v_peak_window record;
  v_peak_count integer;
  v_slot_minutes integer;
  v_open_minutes integer;
BEGIN
  IF NOT public.mobile_internal_secret_ok(p_sync_secret) THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_member FROM public.club_members WHERE id = p_member_id AND club_id = p_club_id LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member does not belong to selected club' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_club FROM public.clubs WHERE id = p_club_id LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Club not found' USING ERRCODE = 'P0002'; END IF;
  SELECT * INTO v_court FROM public.courts WHERE id = p_court_id AND club_id = p_club_id AND COALESCE(is_external, false) = false LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Court does not belong to the selected club' USING ERRCODE = '42501'; END IF;

  v_slot_minutes := COALESCE(v_club.booking_slot_minutes, 30);
  IF v_slot_minutes NOT IN (30, 40, 45, 60) OR p_duration_minutes <> v_slot_minutes THEN
    RAISE EXCEPTION 'This club books in % minute slots', v_slot_minutes USING ERRCODE = '22023';
  END IF;
  v_open_minutes := extract(hour FROM COALESCE(v_club.booking_open_time, time '05:00'))::integer * 60
    + extract(minute FROM COALESCE(v_club.booking_open_time, time '05:00'))::integer;
  IF ((extract(hour FROM p_start_time)::integer * 60 + extract(minute FROM p_start_time)::integer - v_open_minutes) % v_slot_minutes) <> 0 THEN
    RAISE EXCEPTION 'Choose a time on this club''s % minute booking grid', v_slot_minutes USING ERRCODE = '22023';
  END IF;
  IF p_duration_minutes NOT IN (30, 40, 45, 60) THEN RAISE EXCEPTION 'Invalid booking duration' USING ERRCODE = '22023'; END IF;

  v_end_time := (p_start_time + (p_duration_minutes::text || ' minutes')::interval)::time;
  IF p_date < (now() AT TIME ZONE 'Africa/Johannesburg')::date THEN RAISE EXCEPTION 'Cannot book a past date' USING ERRCODE = '22023'; END IF;
  IF p_date = (now() AT TIME ZONE 'Africa/Johannesburg')::date AND p_start_time <= (now() AT TIME ZONE 'Africa/Johannesburg')::time THEN
    RAISE EXCEPTION 'Cannot book a past time' USING ERRCODE = '22023';
  END IF;
  IF p_start_time < COALESCE(v_club.booking_open_time, time '05:00') OR v_end_time > COALESCE(v_club.booking_last_slot_time, time '22:00') + (v_slot_minutes::text || ' minutes')::interval THEN
    RAISE EXCEPTION 'This slot is outside the club booking hours' USING ERRCODE = '22023';
  END IF;

  v_member_status := lower(COALESCE(v_member.status::text, ''));
  v_member_role := lower(COALESCE(v_member.role::text, ''));
  v_booking_suspension_enabled := COALESCE((v_club.suspension_rules->>'enabled')::boolean, false);
  v_booking_suspension_blocks := COALESCE(v_club.suspension_rules->'blocks', '[]'::jsonb);
  v_is_access_suspended := v_member_status IN ('suspended', 'resigned')
    OR (COALESCE(v_member.suspension_manual, false)
      AND lower(COALESCE(v_member.suspension_status::text, '')) IN ('suspended','manual_hold'))
    OR (v_booking_suspension_enabled AND v_booking_suspension_blocks ? 'bookings'
      AND lower(COALESCE(v_member.suspension_status::text, '')) = 'suspended');
  IF v_is_access_suspended OR v_member_status IN ('cancelled','inactive','suspended','rejected','archived','resigned')
    OR (v_member_role = 'visitor' AND NOT COALESCE(v_club.visitors_can_book, false)) THEN
    RAISE EXCEPTION 'This member cannot book courts at the selected club' USING ERRCODE = '42501';
  END IF;

  v_guest_name := NULLIF(left(btrim(COALESCE(p_guest_name, (SELECT b.guest_name FROM public.bookings b WHERE b.id = p_ignore_booking_id))), 80), '');
  IF p_opponent_member_id IS NOT NULL THEN
    IF p_opponent_member_id = p_member_id THEN RAISE EXCEPTION 'Choose a different opponent' USING ERRCODE = '22023'; END IF;
    SELECT * INTO v_opponent FROM public.club_members WHERE id = p_opponent_member_id AND club_id = p_club_id LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'Opponent does not belong to the selected club' USING ERRCODE = '42501'; END IF;
    IF lower(COALESCE(v_opponent.status::text, '')) IN ('cancelled','inactive','suspended','rejected','archived','resigned') THEN
      RAISE EXCEPTION 'Opponent cannot be added to bookings' USING ERRCODE = '42501';
    END IF;
    v_opponent_is_access_suspended := lower(COALESCE(v_opponent.status::text,'')) IN ('suspended','resigned')
      OR (COALESCE(v_opponent.suspension_manual,false)
        AND lower(COALESCE(v_opponent.suspension_status::text,'')) IN ('suspended','manual_hold'))
      OR (v_booking_suspension_enabled AND v_booking_suspension_blocks ? 'bookings'
        AND lower(COALESCE(v_opponent.suspension_status::text,'')) = 'suspended');
    IF v_opponent_is_access_suspended THEN
      RAISE EXCEPTION 'Opponent cannot be added to bookings' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF (COALESCE(v_club.require_visitor_for_member_booking, false) OR NOT COALESCE(v_club.allow_solo_bookings, true))
    AND p_opponent_member_id IS NULL AND v_guest_name IS NULL THEN
    RAISE EXCEPTION 'Choose a club member or enter the visitor''s name; this club does not allow solo bookings' USING ERRCODE = '23514';
  END IF;
  IF NULLIF(btrim(COALESCE(p_guest_name, '')), '') IS NOT NULL AND v_member_role = 'visitor' THEN
    RAISE EXCEPTION 'A visitor account cannot name another visitor on this booking' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.bookings b WHERE b.club_id = p_club_id AND b.court_id = p_court_id AND b.date = p_date
      AND COALESCE(b.status, 'active') = 'active' AND (p_ignore_booking_id IS NULL OR b.id <> p_ignore_booking_id)
      AND b.start_time < v_end_time AND b.end_time > p_start_time
  ) THEN RAISE EXCEPTION 'This slot is already booked' USING ERRCODE = '23P01'; END IF;

  IF EXISTS (SELECT 1 FROM public.bookings b WHERE b.club_id=p_club_id AND b.date=p_date AND COALESCE(b.status,'active')='active'
    AND (p_ignore_booking_id IS NULL OR b.id <> p_ignore_booking_id) AND b.start_time < v_end_time AND b.end_time > p_start_time
    AND (b.club_member_id=p_member_id OR b.opponent_member_id=p_member_id)) THEN
    RAISE EXCEPTION 'You already have a booking that overlaps this time' USING ERRCODE = '23P01';
  END IF;
  IF p_opponent_member_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.bookings b WHERE b.club_id=p_club_id AND b.date=p_date AND COALESCE(b.status,'active')='active'
    AND (p_ignore_booking_id IS NULL OR b.id <> p_ignore_booking_id) AND b.start_time < v_end_time AND b.end_time > p_start_time
    AND (b.club_member_id=p_opponent_member_id OR b.opponent_member_id=p_opponent_member_id)) THEN
    RAISE EXCEPTION 'Opponent already has a booking that overlaps this time' USING ERRCODE = '23P01';
  END IF;

  v_max_daily := GREATEST(1, COALESCE(v_club.max_bookings_per_day, 4));
  SELECT count(*) INTO v_daily_count FROM public.bookings b
  WHERE b.club_id = p_club_id AND b.date = p_date AND COALESCE(b.status, 'active') = 'active'
    AND COALESCE(b.source, '') NOT IN ('club_event','gobook')
    AND (b.guest_name IS NULL OR (b.guest_name !~* '\mleague\M' AND b.guest_name !~* '\mround\s*\d' AND b.guest_name NOT LIKE '% — %'))
    AND (p_ignore_booking_id IS NULL OR b.id <> p_ignore_booking_id)
    AND (b.club_member_id = p_member_id OR b.opponent_member_id = p_member_id);
  IF v_daily_count >= v_max_daily THEN RAISE EXCEPTION 'Daily booking limit reached (max % per day)', v_max_daily USING ERRCODE = '23514'; END IF;
  IF p_opponent_member_id IS NOT NULL THEN
    SELECT count(*) INTO v_daily_count FROM public.bookings b
    WHERE b.club_id = p_club_id AND b.date = p_date AND COALESCE(b.status, 'active') = 'active'
      AND COALESCE(b.source, '') NOT IN ('club_event','gobook')
      AND (b.guest_name IS NULL OR (b.guest_name !~* '\mleague\M' AND b.guest_name !~* '\mround\s*\d' AND b.guest_name NOT LIKE '% — %'))
      AND (p_ignore_booking_id IS NULL OR b.id <> p_ignore_booking_id)
      AND (b.club_member_id = p_opponent_member_id OR b.opponent_member_id = p_opponent_member_id);
    IF v_daily_count >= v_max_daily THEN RAISE EXCEPTION 'Opponent has reached the daily booking limit (max % per day)', v_max_daily USING ERRCODE = '23514'; END IF;
  END IF;

  SELECT * INTO v_peak_window FROM public.club_peak_window(v_club,p_date);
  IF v_club.max_peak_bookings_per_day IS NOT NULL AND p_start_time < v_peak_window.peak_end AND v_end_time > v_peak_window.peak_start THEN
    SELECT count(*) INTO v_peak_count FROM public.bookings b WHERE b.club_id=p_club_id AND b.date=p_date AND COALESCE(b.status,'active')='active'
      AND COALESCE(b.source,'') NOT IN ('club_event','gobook') AND (b.guest_name IS NULL OR (b.guest_name !~* '\mleague\M' AND b.guest_name !~* '\mround\s*\d' AND b.guest_name NOT LIKE '% — %'))
      AND (b.club_member_id=p_member_id OR b.opponent_member_id=p_member_id) AND b.start_time < v_peak_window.peak_end AND b.end_time > v_peak_window.peak_start
      AND (p_ignore_booking_id IS NULL OR b.id <> p_ignore_booking_id);
    IF v_peak_count >= v_club.max_peak_bookings_per_day THEN RAISE EXCEPTION 'Peak booking limit reached (max % per day)', v_club.max_peak_bookings_per_day USING ERRCODE='23514'; END IF;
  END IF;

  IF COALESCE(v_club.block_back_to_back_bookings, false) THEN
    IF EXISTS (SELECT 1 FROM public.bookings b WHERE b.club_id=p_club_id AND b.date=p_date AND COALESCE(b.status,'active')='active'
      AND (p_ignore_booking_id IS NULL OR b.id <> p_ignore_booking_id)
      AND (b.club_member_id=p_member_id OR b.opponent_member_id=p_member_id)
      AND (b.end_time=p_start_time OR b.start_time=v_end_time)) THEN
      RAISE EXCEPTION 'Back-to-back bookings are not allowed' USING ERRCODE = '23514';
    END IF;
    IF p_opponent_member_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.bookings b WHERE b.club_id=p_club_id AND b.date=p_date AND COALESCE(b.status,'active')='active'
      AND (p_ignore_booking_id IS NULL OR b.id <> p_ignore_booking_id)
      AND (b.club_member_id=p_opponent_member_id OR b.opponent_member_id=p_opponent_member_id)
      AND (b.end_time=p_start_time OR b.start_time=v_end_time)) THEN
      RAISE EXCEPTION 'Opponent has a booking directly before or after this slot' USING ERRCODE = '23514';
    END IF;
  END IF;

  v_balance := public.mobile_booking_balance_gate(p_club_id, p_member_id);
  IF NOT COALESCE((v_balance->>'allowed')::boolean, true) THEN
    RAISE EXCEPTION 'Account balance is below the minimum required to book. Shortfall: %', COALESCE(v_balance->>'shortfall', '0') USING ERRCODE = '23514';
  END IF;

  RETURN jsonb_build_object('memberUserId', v_member.user_id,
    'opponentUserId', CASE WHEN p_opponent_member_id IS NULL THEN NULL ELSE v_opponent.user_id END,
    'endTime', v_end_time, 'balance', v_balance);
END;
$$;

REVOKE ALL ON FUNCTION public.mobile_booking_assert_ready(text, uuid, uuid, integer, date, time, integer, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mobile_booking_assert_ready(text, uuid, uuid, integer, date, time, integer, uuid, uuid, text) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.mobile_booking_create(text, uuid, uuid, integer, date, time, integer, uuid, boolean, boolean, text);
CREATE FUNCTION public.mobile_booking_create(
  p_sync_secret text, p_club_id uuid, p_member_id uuid, p_court_id integer,
  p_date date, p_start_time time, p_duration_minutes integer,
  p_opponent_member_id uuid DEFAULT NULL, p_is_friendly boolean DEFAULT true,
  p_lights_requested boolean DEFAULT false, p_light_fee_split text DEFAULT 'booker',
  p_guest_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_ready jsonb; v_booking public.bookings%ROWTYPE; v_guest_name text;
BEGIN
  v_guest_name := NULLIF(left(btrim(COALESCE(p_guest_name, '')), 80), '');
  v_ready := public.mobile_booking_assert_ready(p_sync_secret,p_club_id,p_member_id,p_court_id,p_date,p_start_time,p_duration_minutes,p_opponent_member_id,NULL,v_guest_name);
  INSERT INTO public.bookings (club_id,court_id,user_id,club_member_id,date,start_time,end_time,opponent_id,opponent_member_id,guest_name,is_friendly,lights_requested,light_fee_split,source,status)
  VALUES (p_club_id,p_court_id,NULLIF(v_ready->>'memberUserId','')::uuid,p_member_id,p_date,p_start_time,(v_ready->>'endTime')::time,
    NULLIF(v_ready->>'opponentUserId','')::uuid,p_opponent_member_id,v_guest_name,COALESCE(p_is_friendly,true),COALESCE(p_lights_requested,false),
    CASE WHEN p_light_fee_split='split' THEN 'split' ELSE 'booker' END,'squashhub','active')
  RETURNING * INTO v_booking;
  RETURN jsonb_build_object('bookingId',v_booking.id,'status','created','booking',public.mobile_booking_row_payload(v_booking),'balance',v_ready->'balance');
END;
$$;
REVOKE ALL ON FUNCTION public.mobile_booking_create(text, uuid, uuid, integer, date, time, integer, uuid, boolean, boolean, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mobile_booking_create(text, uuid, uuid, integer, date, time, integer, uuid, boolean, boolean, text, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mobile_booking_availability(
  p_sync_secret text, p_club_id uuid, p_member_id uuid, p_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_club public.clubs%ROWTYPE; v_member public.club_members%ROWTYPE; v_window record;
  v_step integer; v_open time; v_last time; v_start time; v_end time; v_dow integer; v_max integer;
  v_member_count integer; v_peak_count integer; v_adjacent boolean; v_slots jsonb; v_courts jsonb;
  v_now date := (now() AT TIME ZONE 'Africa/Johannesburg')::date;
BEGIN
  IF NOT public.mobile_internal_secret_ok(p_sync_secret) THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_member FROM public.club_members WHERE id=p_member_id AND club_id=p_club_id LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member does not belong to selected club' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_club FROM public.clubs WHERE id=p_club_id LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Club not found' USING ERRCODE='P0002'; END IF;
  v_step := COALESCE(v_club.booking_slot_minutes,30); v_open := COALESCE(v_club.booking_open_time,time '05:00'); v_last := COALESCE(v_club.booking_last_slot_time,time '22:00');
  SELECT * INTO v_window FROM public.club_peak_window(v_club,p_date);
  v_dow := extract(dow FROM p_date)::integer;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('courtId', c.id, 'slots', slots.slot_rows) ORDER BY c.id),'[]'::jsonb)
  INTO v_courts
  FROM public.courts c
  CROSS JOIN LATERAL (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('startTime', to_char(g.t,'HH24:MI'), 'available', status.open, 'reason', status.reason) ORDER BY g.t),'[]'::jsonb) AS slot_rows
    FROM (
      SELECT slot.t AS t,
        NOT EXISTS (SELECT 1 FROM public.bookings b WHERE b.club_id=p_club_id AND b.court_id=c.id AND b.date=p_date AND COALESCE(b.status,'active')='active' AND b.start_time < slot.t + make_interval(mins => v_step) AND b.end_time > slot.t) AS court_open,
        CASE WHEN p_date < v_now OR (p_date=v_now AND slot.t <= (now() AT TIME ZONE 'Africa/Johannesburg')::time) THEN false
          WHEN slot.t < v_open OR slot.t > v_last OR slot.t + make_interval(mins => v_step) > v_last + make_interval(mins => v_step) THEN false
          ELSE true END AS time_open,
        slot.t BETWEEN v_window.peak_start AND v_window.peak_end - interval '1 minute' AS peak_slot,
        (SELECT count(*) FROM public.bookings b WHERE b.club_id=p_club_id AND b.date=p_date AND COALESCE(b.status,'active')='active'
          AND COALESCE(b.source,'') NOT IN ('club_event','gobook') AND (b.guest_name IS NULL OR (b.guest_name !~* '\mleague\M' AND b.guest_name !~* '\mround\s*\d' AND b.guest_name NOT LIKE '% — %'))
          AND (b.club_member_id=p_member_id OR b.opponent_member_id=p_member_id)) AS daily_count,
        (SELECT count(*) FROM public.bookings b WHERE b.club_id=p_club_id AND b.date=p_date AND COALESCE(b.status,'active')='active'
          AND COALESCE(b.source,'') NOT IN ('club_event','gobook') AND (b.guest_name IS NULL OR (b.guest_name !~* '\mleague\M' AND b.guest_name !~* '\mround\s*\d' AND b.guest_name NOT LIKE '% — %'))
          AND (b.club_member_id=p_member_id OR b.opponent_member_id=p_member_id) AND b.start_time < v_window.peak_end AND b.end_time > v_window.peak_start) AS peak_count,
        EXISTS (SELECT 1 FROM public.bookings b WHERE b.club_id=p_club_id AND b.date=p_date AND COALESCE(b.status,'active')='active'
          AND (b.club_member_id=p_member_id OR b.opponent_member_id=p_member_id) AND (b.end_time=slot.t OR b.start_time=slot.t+make_interval(mins => v_step)) ) AS adjacent
      FROM generate_series(0, GREATEST(0, floor(extract(epoch FROM (v_last - v_open)) / 60 / v_step)::integer)) s(n)
      CROSS JOIN LATERAL (SELECT v_open + make_interval(mins => s.n * v_step) AS t) slot
    ) g
    CROSS JOIN LATERAL (SELECT CASE WHEN NOT g.court_open THEN 'Court already booked' WHEN NOT g.time_open THEN 'Outside booking hours'
      WHEN v_club.max_bookings_per_day IS NOT NULL AND g.daily_count >= v_club.max_bookings_per_day THEN 'Daily limit reached'
      WHEN g.peak_slot AND v_club.max_peak_bookings_per_day IS NOT NULL AND g.peak_count >= v_club.max_peak_bookings_per_day THEN 'Peak limit reached'
      WHEN COALESCE(v_club.block_back_to_back_bookings,false) AND g.adjacent THEN 'Back-to-back bookings are not allowed' ELSE NULL END AS reason) r
    CROSS JOIN LATERAL (SELECT (g.court_open AND g.time_open AND r.reason IS NULL) AS open, r.reason) status
  ) slots
  WHERE c.club_id=p_club_id AND COALESCE(c.is_external,false)=false;
  RETURN jsonb_build_object('date',p_date,'policy',jsonb_build_object('slotMinutes',v_step,'openingTime',v_open,'lastSlotTime',v_last,
    'peakWindow',CASE WHEN v_window.peak_start IS NULL THEN NULL ELSE jsonb_build_object('start',v_window.peak_start,'end',v_window.peak_end) END,
    'maxBookingsPerDay',v_club.max_bookings_per_day,'maxPeakBookingsPerDay',v_club.max_peak_bookings_per_day,
    'blockBackToBack',COALESCE(v_club.block_back_to_back_bookings,false),'allowSolo',COALESCE(v_club.allow_solo_bookings,true),
    'requireSecondPlayer',COALESCE(v_club.require_visitor_for_member_booking,false) OR NOT COALESCE(v_club.allow_solo_bookings,true),
    'visitorFee',COALESCE(v_club.visitor_booking_fee,0),'visitorFeeCurrency',COALESCE(v_club.currency_symbol,'R')),'courts',v_courts);
END;
$$;
REVOKE ALL ON FUNCTION public.mobile_booking_availability(text,uuid,uuid,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mobile_booking_availability(text,uuid,uuid,date) TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.mobile_platform_admin_inspection_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('directory','view')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mobile_platform_admin_inspection_audit_created_idx ON public.mobile_platform_admin_inspection_audit(created_at DESC);
ALTER TABLE public.mobile_platform_admin_inspection_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.mobile_platform_admin_inspection_audit FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.mobile_platform_admin_inspection_audit TO service_role;

CREATE OR REPLACE FUNCTION public.mobile_platform_admin_clubs(p_sync_secret text, p_admin_user_id uuid, p_search text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_clubs jsonb;
BEGIN
  IF NOT public.mobile_internal_secret_ok(p_sync_secret) OR NOT public.is_platform_admin(p_admin_user_id) THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'subdomain',c.subdomain,'logoUrl',c.logo_url,'tenantType',c.tenant_type) ORDER BY c.name),'[]'::jsonb)
    INTO v_clubs FROM public.clubs c WHERE p_search IS NULL OR c.name ILIKE '%'||left(p_search,80)||'%' OR c.subdomain ILIKE '%'||left(p_search,80)||'%';
  INSERT INTO public.mobile_platform_admin_inspection_audit(admin_user_id,club_id,action)
    SELECT p_admin_user_id,c.id,'directory' FROM public.clubs c WHERE p_search IS NULL OR c.name ILIKE '%'||left(p_search,80)||'%' OR c.subdomain ILIKE '%'||left(p_search,80)||'%';
  RETURN jsonb_build_object('clubs',v_clubs);
END; $$;
REVOKE ALL ON FUNCTION public.mobile_platform_admin_clubs(text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mobile_platform_admin_clubs(text,uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.mobile_platform_admin_club_overview(p_sync_secret text, p_admin_user_id uuid, p_club_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_club public.clubs%ROWTYPE; v_events jsonb;
BEGIN
  IF NOT public.mobile_internal_secret_ok(p_sync_secret) OR NOT public.is_platform_admin(p_admin_user_id) THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_club FROM public.clubs WHERE id=p_club_id LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Club not found' USING ERRCODE='P0002'; END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',cc.id,'name',cc.name,'status',cc.status,'startsAt',cc.start_date,'endsAt',cc.end_date,
    'fixtureCount',(SELECT count(*) FROM public.club_champs_matches m WHERE m.champ_id=cc.id)) ORDER BY cc.start_date DESC),'[]'::jsonb)
    INTO v_events FROM public.club_champs cc WHERE cc.club_id=p_club_id;
  INSERT INTO public.mobile_platform_admin_inspection_audit(admin_user_id,club_id,action) VALUES(p_admin_user_id,p_club_id,'view');
  RETURN jsonb_build_object('readOnly',true,'club',jsonb_build_object('id',v_club.id,'name',v_club.name,'logoUrl',v_club.logo_url,'subdomain',v_club.subdomain,
    'tenantType',v_club.tenant_type,'bookingSlotMinutes',v_club.booking_slot_minutes,'bookingOpenTime',v_club.booking_open_time,'bookingLastSlotTime',v_club.booking_last_slot_time,
    'allowSoloBookings',v_club.allow_solo_bookings,'requireVisitor',v_club.require_visitor_for_member_booking,'visitorFee',v_club.visitor_booking_fee), 'tournaments',v_events);
END; $$;
REVOKE ALL ON FUNCTION public.mobile_platform_admin_club_overview(text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mobile_platform_admin_club_overview(text,uuid,uuid) TO service_role;

NOTIFY pgrst, 'reload schema';

-- Exchange a verified Supabase Auth session for the short-lived Player API
-- session on native clients. The API validates the bearer with Supabase Auth.
CREATE OR REPLACE FUNCTION public.mobile_resolve_auth_user_club_access(
  p_sync_secret text, p_auth_user_id uuid, p_email text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','auth'
AS $$
DECLARE v_user_id uuid; v_memberships jsonb := '[]'::jsonb; v_linked jsonb := '[]'::jsonb; v_admin boolean := false;
BEGIN
  IF NOT public.mobile_internal_secret_ok(p_sync_secret) THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501'; END IF;
  SELECT u.id INTO v_user_id FROM auth.users u
    WHERE u.id=p_auth_user_id AND lower(u.email)=lower(trim(p_email)) AND u.email_confirmed_at IS NOT NULL LIMIT 1;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Verified account required' USING ERRCODE='42501'; END IF;
  SELECT EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id=v_user_id AND ur.role IN ('admin','moderator')) INTO v_admin;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('clubId',own.club_id,'memberId',own.id,'role',own.role) ORDER BY own.club_id),'[]'::jsonb)
    INTO v_memberships FROM (
      SELECT DISTINCT ON(cm.club_id) cm.id,cm.club_id,cm.role FROM public.club_members cm
      WHERE cm.user_id=v_user_id AND COALESCE(cm.is_pending_approval,false)=false AND cm.access_suspended_at IS NULL
        AND COALESCE(cm.suspension_status::text,'') NOT IN ('suspended','manual_hold','blocked','revoked')
      AND lower(COALESCE(cm.status::text,'active')) NOT IN ('inactive','suspended','blocked','disabled','cancelled','canceled','resigned','deleted','rejected','pending','pending_approval','application','requested','expired')
      ORDER BY cm.club_id,cm.joined_at ASC NULLS LAST,cm.id ASC
    ) own;
  SELECT COALESCE(jsonb_agg(linked.id ORDER BY linked.club_id,linked.id),'[]'::jsonb) INTO v_linked
    FROM public.club_members linked WHERE lower(COALESCE(linked.email,''))=lower(trim(p_email))
      AND COALESCE(linked.is_pending_approval,false)=false AND linked.access_suspended_at IS NULL
      AND COALESCE(linked.suspension_status::text,'') NOT IN ('suspended','manual_hold','blocked','revoked')
      AND lower(COALESCE(linked.status::text,'active')) NOT IN ('inactive','suspended','blocked','disabled','cancelled','canceled','resigned','deleted','rejected','pending','pending_approval','application','requested','expired')
      AND EXISTS(SELECT 1 FROM public.club_members own WHERE own.user_id=v_user_id AND own.club_id=linked.club_id
        AND COALESCE(own.is_pending_approval,false)=false AND own.access_suspended_at IS NULL
        AND COALESCE(own.suspension_status::text,'') NOT IN ('suspended','manual_hold','blocked','revoked')
        AND lower(COALESCE(own.status::text,'active')) NOT IN ('inactive','suspended','blocked','disabled','cancelled','canceled','resigned','deleted','rejected','pending','pending_approval','application','requested','expired'));
  RETURN jsonb_build_object('userId',v_user_id,'isPlatformAdmin',v_admin,'memberships',v_memberships,'linkedMemberIds',v_linked);
END; $$;
REVOKE ALL ON FUNCTION public.mobile_resolve_auth_user_club_access(text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mobile_resolve_auth_user_club_access(text,uuid,text) TO anon,authenticated,service_role;
NOTIFY pgrst, 'reload schema';

CREATE OR REPLACE FUNCTION public.mobile_member_spend_summary(p_sync_secret text,p_club_id uuid,p_member_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_gate record;
BEGIN
  IF NOT public.mobile_internal_secret_ok(p_sync_secret) THEN RAISE EXCEPTION 'Unauthorized' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.club_members WHERE id=p_member_id AND club_id=p_club_id) THEN RAISE EXCEPTION 'Member does not belong to selected club' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_gate FROM public.member_account_gate(p_member_id,0);
  RETURN jsonb_build_object('accountAllowance',round(COALESCE(v_gate.allowance,0)::numeric,2),
    'availableToSpend',round((COALESCE(v_gate.allowance,0)-COALESCE(v_gate.current_owing,0))::numeric,2));
END; $$;
REVOKE ALL ON FUNCTION public.mobile_member_spend_summary(text,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mobile_member_spend_summary(text,uuid,uuid) TO anon,authenticated,service_role;
NOTIFY pgrst, 'reload schema';
