ALTER TABLE public.club_devices ADD COLUMN IF NOT EXISTS min_age integer;
ALTER TABLE public.club_devices ADD CONSTRAINT club_devices_min_age_chk CHECK (min_age IS NULL OR (min_age BETWEEN 1 AND 120 AND category = 'access'));
COMMENT ON COLUMN public.club_devices.min_age IS 'Optional minimum age (years) for Access devices; NULL = no age restriction. Enforced by device-control on unlock.';