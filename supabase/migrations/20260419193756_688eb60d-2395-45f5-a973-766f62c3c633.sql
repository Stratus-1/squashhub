-- Track which association a member has opted into (set on the CLUB-side member row)
ALTER TABLE public.club_members
  ADD COLUMN IF NOT EXISTS enable_league_association_id uuid REFERENCES public.clubs(id) ON DELETE SET NULL;

-- Flag association-side member rows that exist purely for league participation
ALTER TABLE public.club_members
  ADD COLUMN IF NOT EXISTS is_league_only_membership boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_club_members_enable_league_association
  ON public.club_members(enable_league_association_id)
  WHERE enable_league_association_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_club_members_league_only
  ON public.club_members(club_id, is_league_only_membership)
  WHERE is_league_only_membership = true;