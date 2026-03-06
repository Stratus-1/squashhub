-- Add Strava-derived training stats to profiles so other players can see them
-- (populated by the `strava` Edge Function on sync)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS strava_connected boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS strava_activities_count integer,
  ADD COLUMN IF NOT EXISTS strava_distance_m bigint,
  ADD COLUMN IF NOT EXISTS strava_moving_time_s integer,
  ADD COLUMN IF NOT EXISTS strava_elevation_m integer,
  ADD COLUMN IF NOT EXISTS strava_last_sync_at timestamp with time zone;

