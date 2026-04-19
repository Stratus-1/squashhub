ALTER TABLE public.club_members
ADD COLUMN IF NOT EXISTS home_club_id uuid REFERENCES public.clubs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_club_members_home_club_id ON public.club_members(home_club_id);