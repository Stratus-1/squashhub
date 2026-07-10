ALTER TABLE public.courts
  ADD COLUMN IF NOT EXISTS is_external boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS venue_name text;
CREATE INDEX IF NOT EXISTS courts_club_external_idx ON public.courts (club_id, is_external);