ALTER TABLE public.club_secrets
  ADD COLUMN IF NOT EXISTS ble_fallback_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shelly_door_ble_mac text,
  ADD COLUMN IF NOT EXISTS shelly_ble_control_password text;

ALTER TABLE public.courts
  ADD COLUMN IF NOT EXISTS relay_ble_mac text;