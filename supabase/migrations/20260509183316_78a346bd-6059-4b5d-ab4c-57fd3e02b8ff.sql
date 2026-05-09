
CREATE OR REPLACE FUNCTION public.enforce_peak_booking_cap()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club           public.clubs%ROWTYPE;
  v_dow            int;
  v_is_weekend     boolean;
  v_peak_start     time;
  v_peak_end       time;
  v_max            int;
  v_overlaps_peak  boolean;
  v_count          int;
  v_member_ids     uuid[] := ARRAY[]::uuid[];
  v_user_ids       uuid[] := ARRAY[]::uuid[];
  v_mid            uuid;
BEGIN
  IF NEW.status IS NOT NULL AND NEW.status <> 'active' THEN RETURN NEW; END IF;
  IF NEW.guest_name IS NOT NULL
     AND (NEW.guest_name ~* '\mleague\M' OR NEW.guest_name ~* '\mround\s*\d') THEN
    RETURN NEW;
  END IF;
  IF NEW.club_id IS NULL OR NEW.date IS NULL OR NEW.start_time IS NULL OR NEW.end_time IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_club FROM public.clubs WHERE id = NEW.club_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  v_dow := EXTRACT(DOW FROM NEW.date)::int;
  v_is_weekend := v_dow = 0 OR v_dow = 6;
  IF v_is_weekend THEN
    v_peak_start := COALESCE(v_club.peak_weekend_start, time '08:00');
    v_peak_end   := COALESCE(v_club.peak_weekend_end,   time '12:00');
  ELSE
    v_peak_start := COALESCE(v_club.peak_weekday_start, time '16:00');
    v_peak_end   := COALESCE(v_club.peak_weekday_end,   time '19:00');
  END IF;
  v_max := GREATEST(1, COALESCE(v_club.max_peak_bookings_per_day, 1));

  v_overlaps_peak := NEW.start_time < v_peak_end AND NEW.end_time > v_peak_start;
  IF NOT v_overlaps_peak THEN RETURN NEW; END IF;

  IF NEW.club_member_id     IS NOT NULL THEN v_member_ids := v_member_ids || NEW.club_member_id;     END IF;
  IF NEW.opponent_member_id IS NOT NULL THEN v_member_ids := v_member_ids || NEW.opponent_member_id; END IF;
  IF NEW.user_id     IS NOT NULL THEN v_user_ids := v_user_ids || NEW.user_id;     END IF;
  IF NEW.opponent_id IS NOT NULL THEN v_user_ids := v_user_ids || NEW.opponent_id; END IF;

  FOREACH v_mid IN ARRAY v_member_ids LOOP
    SELECT count(*) INTO v_count
    FROM public.bookings b
    WHERE b.club_id = NEW.club_id
      AND b.date = NEW.date
      AND b.id <> NEW.id
      AND (b.status IS NULL OR b.status = 'active')
      AND (b.guest_name IS NULL OR (b.guest_name !~* '\mleague\M' AND b.guest_name !~* '\mround\s*\d'))
      AND b.start_time < v_peak_end
      AND b.end_time   > v_peak_start
      AND (b.club_member_id = v_mid OR b.opponent_member_id = v_mid);
    IF v_count >= v_max THEN
      RAISE EXCEPTION 'Peak-hour booking limit reached (max % per day) for one of the players.', v_max
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;

  IF array_length(v_user_ids, 1) IS NOT NULL THEN
    FOR v_mid IN SELECT unnest(v_user_ids) LOOP
      SELECT count(*) INTO v_count
      FROM public.bookings b
      WHERE b.club_id = NEW.club_id
        AND b.date = NEW.date
        AND b.id <> NEW.id
        AND (b.status IS NULL OR b.status = 'active')
        AND (b.guest_name IS NULL OR (b.guest_name !~* '\mleague\M' AND b.guest_name !~* '\mround\s*\d'))
        AND b.start_time < v_peak_end
        AND b.end_time   > v_peak_start
        AND (b.user_id = v_mid OR b.opponent_id = v_mid);
      IF v_count >= v_max THEN
        RAISE EXCEPTION 'Peak-hour booking limit reached (max % per day) for one of the players.', v_max
          USING ERRCODE = 'check_violation';
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_peak_booking_cap ON public.bookings;
CREATE TRIGGER trg_enforce_peak_booking_cap
BEFORE INSERT OR UPDATE OF court_id, date, start_time, end_time, user_id, opponent_id, club_member_id, opponent_member_id, status, guest_name, club_id
ON public.bookings
FOR EACH ROW
EXECUTE FUNCTION public.enforce_peak_booking_cap();
