-- Null out stale references that don't exist in league_associations
UPDATE public.club_members
SET enable_league_association_id = NULL
WHERE enable_league_association_id IS NOT NULL
  AND enable_league_association_id NOT IN (SELECT id FROM public.league_associations);

-- Swap the FK to point at league_associations (where the app actually expects it)
ALTER TABLE public.club_members
  DROP CONSTRAINT IF EXISTS club_members_enable_league_association_id_fkey;

ALTER TABLE public.club_members
  ADD CONSTRAINT club_members_enable_league_association_id_fkey
  FOREIGN KEY (enable_league_association_id)
  REFERENCES public.league_associations(id)
  ON DELETE SET NULL;