-- Add extra match stats fields for richer reporting
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS duration_s integer,
  ADD COLUMN IF NOT EXISTS notes text;

