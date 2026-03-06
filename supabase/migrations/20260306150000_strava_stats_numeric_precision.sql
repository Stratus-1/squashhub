-- Store Strava totals with decimal precision (Strava distances/elevation can be non-integers)

ALTER TABLE public.profiles
  ALTER COLUMN strava_distance_m TYPE numeric USING strava_distance_m::numeric,
  ALTER COLUMN strava_elevation_m TYPE numeric USING strava_elevation_m::numeric;

