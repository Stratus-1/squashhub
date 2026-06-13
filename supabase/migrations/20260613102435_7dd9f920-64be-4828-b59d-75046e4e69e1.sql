ALTER TABLE public.club_champs
  ADD COLUMN IF NOT EXISTS registration_required boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS payment_required boolean NOT NULL DEFAULT true;