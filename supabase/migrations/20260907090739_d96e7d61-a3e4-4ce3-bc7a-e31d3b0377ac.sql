ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS invite_short_message boolean NOT NULL DEFAULT false;