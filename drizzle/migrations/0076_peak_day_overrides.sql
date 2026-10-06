ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS peak_day_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.clubs.peak_day_overrides IS 'Per-weekday peak override keyed by JS day number "0"(Sun)-"6"(Sat): {"start":"HH:MM","end":"HH:MM"} or {"off":true}. Missing day = weekday/weekend default.';

CREATE OR REPLACE FUNCTION public.club_peak_window(_club public.clubs, _date date, OUT peak_start time, OUT peak_end time)
LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
DECLARE v_dow int := EXTRACT(DOW FROM _date)::int; v_o jsonb;
BEGIN
  v_o := COALESCE(_club.peak_day_overrides, '{}'::jsonb) -> v_dow::text;
  IF v_o IS NOT NULL AND jsonb_typeof(v_o) = 'object' THEN
    IF COALESCE((v_o->>'off')::boolean, false) THEN peak_start := NULL; peak_end := NULL; RETURN; END IF;
    IF v_o ? 'start' AND v_o ? 'end' THEN
      peak_start := (v_o->>'start')::time; peak_end := (v_o->>'end')::time; RETURN;
    END IF;
  END IF;
  IF v_dow IN (0,6) THEN
    peak_start := COALESCE(_club.peak_weekend_start, time '08:00'); peak_end := COALESCE(_club.peak_weekend_end, time '12:00');
  ELSE
    peak_start := COALESCE(_club.peak_weekday_start, time '16:00'); peak_end := COALESCE(_club.peak_weekday_end, time '19:00');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_peak_booking_cap()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_club public.clubs%ROWTYPE; v_peak_start time; v_peak_end time; v_max int; v_count int;
  v_member_ids uuid[] := ARRAY[]::uuid[]; v_user_ids uuid[] := ARRAY[]::uuid[]; v_mid uuid;
BEGIN
  IF NEW.status IS NOT NULL AND NEW.status <> 'active' THEN RETURN NEW; END IF;
  IF COALESCE(NEW.source, '') IN ('club_event', 'gobook')
     OR (NEW.guest_name IS NOT NULL AND (NEW.guest_name ~* '\mleague\M' OR NEW.guest_name ~* '\mround\s*\d' OR NEW.guest_name LIKE '% — %')) THEN
    RETURN NEW;
  END IF;
  IF NEW.club_id IS NULL OR NEW.date IS NULL OR NEW.start_time IS NULL OR NEW.end_time IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO v_club FROM public.clubs WHERE id = NEW.club_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  SELECT w.peak_start, w.peak_end INTO v_peak_start, v_peak_end FROM public.club_peak_window(v_club, NEW.date) w;
  IF v_peak_start IS NULL OR v_peak_end IS NULL THEN RETURN NEW; END IF;
  v_max := GREATEST(1, COALESCE(v_club.max_peak_bookings_per_day, 1));
  IF NOT (NEW.start_time < v_peak_end AND NEW.end_time > v_peak_start) THEN RETURN NEW; END IF;

  IF NEW.club_member_id IS NOT NULL THEN v_member_ids := v_member_ids || NEW.club_member_id; END IF;
  IF NEW.opponent_member_id IS NOT NULL THEN v_member_ids := v_member_ids || NEW.opponent_member_id; END IF;
  IF NEW.user_id IS NOT NULL THEN v_user_ids := v_user_ids || NEW.user_id; END IF;
  IF NEW.opponent_id IS NOT NULL THEN v_user_ids := v_user_ids || NEW.opponent_id; END IF;

  FOREACH v_mid IN ARRAY v_member_ids LOOP
    SELECT count(*) INTO v_count FROM public.bookings b
    WHERE b.club_id = NEW.club_id AND b.date = NEW.date AND b.id <> NEW.id
      AND (b.status IS NULL OR b.status = 'active')
      AND COALESCE(b.source, '') NOT IN ('club_event', 'gobook')
      AND (b.guest_name IS NULL OR (b.guest_name !~* '\mleague\M' AND b.guest_name !~* '\mround\s*\d' AND b.guest_name NOT LIKE '% — %'))
      AND b.start_time < v_peak_end AND b.end_time > v_peak_start
      AND (b.club_member_id = v_mid OR b.opponent_member_id = v_mid);
    IF v_count >= v_max THEN
      RAISE EXCEPTION 'Peak-hour booking limit reached (max % per day) for one of the players.', v_max USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  IF array_length(v_user_ids, 1) IS NOT NULL THEN
    FOR v_mid IN SELECT unnest(v_user_ids) LOOP
      SELECT count(*) INTO v_count FROM public.bookings b
      WHERE b.club_id = NEW.club_id AND b.date = NEW.date AND b.id <> NEW.id
        AND (b.status IS NULL OR b.status = 'active')
        AND COALESCE(b.source, '') NOT IN ('club_event', 'gobook')
        AND (b.guest_name IS NULL OR (b.guest_name !~* '\mleague\M' AND b.guest_name !~* '\mround\s*\d' AND b.guest_name NOT LIKE '% — %'))
        AND b.start_time < v_peak_end AND b.end_time > v_peak_start
        AND (b.user_id = v_mid OR b.opponent_id = v_mid);
      IF v_count >= v_max THEN
        RAISE EXCEPTION 'Peak-hour booking limit reached (max % per day) for one of the players.', v_max USING ERRCODE = 'check_violation';
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$function$;