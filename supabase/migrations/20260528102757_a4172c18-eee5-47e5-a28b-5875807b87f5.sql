ALTER TABLE public.member_gobook_credentials
  ADD COLUMN IF NOT EXISTS gobook_pin TEXT;