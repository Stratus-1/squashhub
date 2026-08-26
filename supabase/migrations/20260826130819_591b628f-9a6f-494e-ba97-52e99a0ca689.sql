ALTER TABLE public.club_members
  ADD COLUMN IF NOT EXISTS occupation text,
  ADD COLUMN IF NOT EXISTS skills text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS skills_other text,
  ADD COLUMN IF NOT EXISTS volunteer_willing boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS skills_updated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_club_members_skills ON public.club_members USING gin (skills);
CREATE INDEX IF NOT EXISTS idx_club_members_volunteer ON public.club_members (club_id, volunteer_willing);