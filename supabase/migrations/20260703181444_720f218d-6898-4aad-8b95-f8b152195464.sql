
ALTER TABLE public.club_secrets
  ADD COLUMN IF NOT EXISTS shelly_server_url text,
  ADD COLUMN IF NOT EXISTS shelly_door_device_id text,
  ADD COLUMN IF NOT EXISTS shelly_door_channel integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shelly_door_pulse_ms integer DEFAULT 3000;
