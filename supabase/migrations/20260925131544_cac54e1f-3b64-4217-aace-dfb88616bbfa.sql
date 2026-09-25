ALTER TABLE public.club_devices
  ADD COLUMN IF NOT EXISTS geofence_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS geofence_latitude double precision,
  ADD COLUMN IF NOT EXISTS geofence_longitude double precision,
  ADD COLUMN IF NOT EXISTS geofence_radius_m integer NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS auto_unlock_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_unlock_seconds integer NOT NULL DEFAULT 12;
ALTER TABLE public.club_devices
  ADD CONSTRAINT club_devices_geofence_radius_chk CHECK (geofence_radius_m BETWEEN 5 AND 5000),
  ADD CONSTRAINT club_devices_auto_unlock_seconds_chk CHECK (auto_unlock_seconds BETWEEN 1 AND 120);
ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS door_auto_unlock_seconds integer NOT NULL DEFAULT 12;
ALTER TABLE public.clubs
  ADD CONSTRAINT clubs_door_auto_unlock_seconds_chk CHECK (door_auto_unlock_seconds BETWEEN 1 AND 120);