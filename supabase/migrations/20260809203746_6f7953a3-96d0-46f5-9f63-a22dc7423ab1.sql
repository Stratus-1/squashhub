ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS whatsapp_sender_mode text NOT NULL DEFAULT 'platform';

ALTER TABLE public.club_secrets
  ADD COLUMN IF NOT EXISTS whatsapp_account_sid text,
  ADD COLUMN IF NOT EXISTS whatsapp_auth_token text,
  ADD COLUMN IF NOT EXISTS whatsapp_from text;