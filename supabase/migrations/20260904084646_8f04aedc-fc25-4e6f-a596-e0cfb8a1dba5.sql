-- Scheduled gadget control for admin-managed IoT devices.
-- First use case: Gordon's Bay geyser as a Shelly gadget with an optional
-- recurring on/off timer.

ALTER TABLE public.club_devices
  ADD COLUMN IF NOT EXISTS schedule_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS schedule_timezone text NOT NULL DEFAULT 'Africa/Johannesburg',
  ADD COLUMN IF NOT EXISTS schedule_days integer[] NOT NULL DEFAULT ARRAY[1,2,3,4,5,6,7],
  ADD COLUMN IF NOT EXISTS schedule_on_time time,
  ADD COLUMN IF NOT EXISTS schedule_off_time time,
  ADD COLUMN IF NOT EXISTS schedule_last_on_key text,
  ADD COLUMN IF NOT EXISTS schedule_last_off_key text,
  ADD COLUMN IF NOT EXISTS schedule_last_checked_at timestamptz;

ALTER TABLE public.club_devices
  DROP CONSTRAINT IF EXISTS club_devices_schedule_days_valid,
  ADD CONSTRAINT club_devices_schedule_days_valid
    CHECK (
      schedule_days IS NOT NULL
      AND array_length(schedule_days, 1) BETWEEN 1 AND 7
      AND schedule_days <@ ARRAY[1,2,3,4,5,6,7]
    );

ALTER TABLE public.club_devices
  DROP CONSTRAINT IF EXISTS club_devices_schedule_times_valid,
  ADD CONSTRAINT club_devices_schedule_times_valid
    CHECK (
      schedule_enabled = false
      OR (
        category = 'gadgets'
        AND control_mode = 'toggle'
        AND provider = 'shelly'
        AND schedule_on_time IS NOT NULL
        AND schedule_off_time IS NOT NULL
        AND schedule_on_time <> schedule_off_time
      )
    );

WITH target_club AS (
  SELECT id
  FROM public.clubs
  WHERE name ILIKE '%gordon%bay%'
  LIMIT 1
)
INSERT INTO public.club_devices (
  club_id,
  category,
  name,
  icon,
  location,
  notes,
  enabled,
  sort_order,
  control_mode,
  provider,
  shelly_device_id,
  shelly_channel,
  pulse_ms,
  ble_mac,
  auto_off_minutes,
  schedule_enabled,
  schedule_timezone,
  schedule_days
)
SELECT
  id,
  'gadgets',
  'Geyser',
  'flame',
  'Gordon''s Bay',
  'Shelly Ogemray 25A geyser controller. Device MAC 70:af:09:ee:01:d8, IP 192.168.0.6, model S3PB-O3AR000001.',
  true,
  10,
  'toggle',
  'shelly',
  'XM123897088180696V0001A9000003',
  0,
  3000,
  '70:AF:09:EE:01:D8',
  120,
  false,
  'Africa/Johannesburg',
  ARRAY[1,2,3,4,5,6,7]
FROM target_club
ON CONFLICT (club_id, category, name) DO UPDATE
SET
  icon = EXCLUDED.icon,
  location = EXCLUDED.location,
  notes = EXCLUDED.notes,
  enabled = true,
  control_mode = 'toggle',
  provider = 'shelly',
  shelly_device_id = EXCLUDED.shelly_device_id,
  shelly_channel = EXCLUDED.shelly_channel,
  ble_mac = EXCLUDED.ble_mac,
  auto_off_minutes = COALESCE(public.club_devices.auto_off_minutes, EXCLUDED.auto_off_minutes),
  schedule_timezone = COALESCE(public.club_devices.schedule_timezone, EXCLUDED.schedule_timezone),
  updated_at = now();