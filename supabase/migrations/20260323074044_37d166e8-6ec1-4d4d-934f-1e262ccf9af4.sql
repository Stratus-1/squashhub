ALTER TABLE public.club_secrets
ADD COLUMN IF NOT EXISTS relay_device_type text NOT NULL DEFAULT 'shelly';

COMMENT ON COLUMN public.club_secrets.relay_device_type IS 'Type of smart relay device used for court lights (shelly, sonoff, tasmota, home_assistant, other)';