ALTER TABLE public.club_champs
  ADD COLUMN IF NOT EXISTS include_visitors boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS visitor_clubs text[] NOT NULL DEFAULT '{}'::text[];