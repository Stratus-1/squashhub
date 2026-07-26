UPDATE public.bookings b
SET status = 'active', booking_type = 'league'
FROM public.platform_league_fixtures f
WHERE f.booking_id = b.id
  AND b.status = 'cancelled'
  AND f.court_id IS NOT NULL
  AND f.start_time IS NOT NULL
  AND f.away_team_code <> '__BYE__'
  AND f.fixture_date >= CURRENT_DATE
  AND b.court_id = f.court_id
  AND b.date = f.fixture_date
  AND b.start_time = f.start_time
  AND NOT EXISTS (
    SELECT 1 FROM public.bookings x
    WHERE x.court_id = b.court_id
      AND x.date = b.date
      AND x.start_time = b.start_time
      AND x.status = 'active'
  );