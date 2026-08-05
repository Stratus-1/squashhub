ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS door_geofence_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS door_latitude double precision,
  ADD COLUMN IF NOT EXISTS door_longitude double precision,
  ADD COLUMN IF NOT EXISTS door_geofence_radius_m integer NOT NULL DEFAULT 150;