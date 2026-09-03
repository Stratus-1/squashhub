ALTER TABLE public.club_secrets
  ADD COLUMN IF NOT EXISTS gobook_api_username text,
  ADD COLUMN IF NOT EXISTS gobook_api_password text;

ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS gobook_api_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS gobook_provider_id integer,
  ADD COLUMN IF NOT EXISTS gobook_service_id integer;