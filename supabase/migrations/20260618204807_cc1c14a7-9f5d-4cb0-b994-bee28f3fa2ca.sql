ALTER TABLE public.club_champs_registrations
  ADD COLUMN IF NOT EXISTS invited_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmed_by uuid,
  ADD COLUMN IF NOT EXISTS confirmation_source text CHECK (confirmation_source IN ('rsvp','payment','admin'));