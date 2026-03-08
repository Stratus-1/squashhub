-- Court presence tracking (opt-in)
-- Goal:
-- - Detect when a user is physically at the club courts (geofence around a known coordinate)
-- - If they are at the courts but have no active booking, flag it + notify user/admins

-- 1) Store geofence parameters in app_settings (public keys)
INSERT INTO public.app_settings (key, value)
VALUES
  ('court_location_lat', '-34.15452253664911'),
  ('court_location_lng', '18.874216594691532'),
  ('court_location_radius_m', '120')
ON CONFLICT (key) DO NOTHING;

-- 2) Opt-in flag on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS court_checkins_enabled boolean NOT NULL DEFAULT false;

-- 3) Presence events table
CREATE TABLE IF NOT EXISTS public.court_presence_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  observed_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'web' CHECK (source IN ('web', 'native')),
  accuracy_m double precision,
  distance_m double precision NOT NULL,
  radius_m double precision NOT NULL,
  at_court boolean NOT NULL,
  had_booking boolean NOT NULL,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS court_presence_events_user_observed_idx
  ON public.court_presence_events(user_id, observed_at DESC);

CREATE INDEX IF NOT EXISTS court_presence_events_unbooked_idx
  ON public.court_presence_events(at_court, had_booking, observed_at DESC);

ALTER TABLE public.court_presence_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'court_presence_events' AND policyname = 'Users can view own court presence'
  ) THEN
    CREATE POLICY "Users can view own court presence"
      ON public.court_presence_events FOR SELECT TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'court_presence_events' AND policyname = 'Users can insert own court presence'
  ) THEN
    CREATE POLICY "Users can insert own court presence"
      ON public.court_presence_events FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'court_presence_events' AND policyname = 'Admins can view all court presence'
  ) THEN
    CREATE POLICY "Admins can view all court presence"
      ON public.court_presence_events FOR SELECT TO authenticated
      USING (public.is_admin_or_moderator(auth.uid()));
  END IF;
END $$;

-- 4) RPC: record a presence observation and compute "forgot to book" server-side
CREATE OR REPLACE FUNCTION public.record_court_presence(
  lat double precision,
  lng double precision,
  accuracy_m double precision DEFAULT NULL,
  observed_at timestamptz DEFAULT now(),
  source text DEFAULT 'web'
)
RETURNS public.court_presence_events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
  court_lat double precision;
  court_lng double precision;
  radius_m double precision;
  distance_m double precision;
  at_court boolean;
  booking_id uuid;
  had_booking boolean;
  local_ts timestamp;
  should_notify boolean;
  pname text;
  admin_id uuid;
  row public.court_presence_events%rowtype;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT value::double precision INTO court_lat FROM public.app_settings WHERE key = 'court_location_lat';
  SELECT value::double precision INTO court_lng FROM public.app_settings WHERE key = 'court_location_lng';
  SELECT value::double precision INTO radius_m FROM public.app_settings WHERE key = 'court_location_radius_m';

  court_lat := COALESCE(court_lat, -34.15452253664911);
  court_lng := COALESCE(court_lng, 18.874216594691532);
  radius_m := COALESCE(radius_m, 120);

  -- Haversine distance (meters)
  distance_m := 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat - court_lat) / 2), 2)
    + cos(radians(court_lat)) * cos(radians(lat)) * power(sin(radians(lng - court_lng) / 2), 2)
  ));

  at_court := distance_m <= radius_m AND (accuracy_m IS NULL OR accuracy_m <= 200);

  local_ts := observed_at AT TIME ZONE 'Africa/Johannesburg';

  SELECT b.id
  INTO booking_id
  FROM public.bookings b
  WHERE b.status = 'active'
    AND b.date = local_ts::date
    AND (b.user_id = uid OR b.opponent_id = uid)
    AND b.start_time <= local_ts::time
    AND b.end_time >= local_ts::time
  LIMIT 1;

  had_booking := booking_id IS NOT NULL;

  INSERT INTO public.court_presence_events (
    user_id, observed_at, source, accuracy_m,
    distance_m, radius_m, at_court,
    had_booking, booking_id
  )
  VALUES (
    uid, observed_at, COALESCE(NULLIF(source, ''), 'web'), accuracy_m,
    distance_m, radius_m, at_court,
    had_booking, booking_id
  )
  RETURNING * INTO row;

  IF at_court AND NOT had_booking THEN
    -- De-dupe notifications (avoid spamming if the user refreshes the page)
    SELECT NOT EXISTS (
      SELECT 1
      FROM public.notifications n
      WHERE n.user_id = uid
        AND n.type = 'court_checkin'
        AND n.created_at > now() - interval '2 hours'
    )
    INTO should_notify;

    IF should_notify THEN
      INSERT INTO public.notifications (user_id, title, message, type)
      VALUES (
        uid,
        'At the courts?',
        'We detected you at the courts but no active booking was found. Book a slot (or set it as Friendly) so your game is tracked properly.',
        'court_checkin'
      );

      SELECT p.name INTO pname FROM public.profiles p WHERE p.id = uid;
      pname := COALESCE(NULLIF(pname, ''), 'A player');

      FOR admin_id IN
        SELECT ur.user_id
        FROM public.user_roles ur
        WHERE ur.role IN ('admin'::public.app_role, 'moderator'::public.app_role)
          AND ur.user_id <> uid
      LOOP
        INSERT INTO public.notifications (user_id, title, message, type)
        VALUES (
          admin_id,
          'Unbooked court visit',
          pname || ' appears to be at the courts without a booking (' || round(distance_m)::text || 'm away).',
          'admin'
        );
      END LOOP;
    END IF;
  END IF;

  RETURN row;
END;
$$;

REVOKE ALL ON FUNCTION public.record_court_presence(double precision, double precision, double precision, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_court_presence(double precision, double precision, double precision, timestamptz, text) TO authenticated;

