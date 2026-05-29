ALTER TABLE public.club_secrets
  ADD COLUMN IF NOT EXISTS fluss_api_token text,
  ADD COLUMN IF NOT EXISTS fluss_default_device_id text;

ALTER TABLE public.courts
  ADD COLUMN IF NOT EXISTS fluss_device_id text;