-- Permanent member ↔ league association affiliations.
-- This table preserves a member's league association number (e.g. NSF-021)
-- even when seasonal team/league rosters are deleted and rebuilt.

CREATE TABLE IF NOT EXISTS public.member_association_affiliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  association_id uuid NOT NULL REFERENCES public.league_associations(id) ON DELETE CASCADE,
  league_association_number text,
  active boolean NOT NULL DEFAULT true,
  joined_at timestamptz NOT NULL DEFAULT now(),
  deactivated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (club_member_id, association_id)
);

-- Reserve the number per association: once issued, no two members can share it
CREATE UNIQUE INDEX IF NOT EXISTS uniq_assoc_number
  ON public.member_association_affiliations (association_id, league_association_number)
  WHERE league_association_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_maa_member ON public.member_association_affiliations (club_member_id);
CREATE INDEX IF NOT EXISTS idx_maa_assoc  ON public.member_association_affiliations (association_id);

ALTER TABLE public.member_association_affiliations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members and admins can view affiliations"
  ON public.member_association_affiliations FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.id = member_association_affiliations.club_member_id
      AND (cm.user_id = auth.uid() OR public.is_club_admin(auth.uid(), cm.club_id))
  ));

CREATE POLICY "Members or admins can insert affiliations"
  ON public.member_association_affiliations FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.id = member_association_affiliations.club_member_id
      AND (cm.user_id = auth.uid() OR public.is_club_admin(auth.uid(), cm.club_id))
  ));

CREATE POLICY "Members or admins can update affiliations"
  ON public.member_association_affiliations FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.id = member_association_affiliations.club_member_id
      AND (cm.user_id = auth.uid() OR public.is_club_admin(auth.uid(), cm.club_id))
  ));

CREATE POLICY "Admins can delete affiliations"
  ON public.member_association_affiliations FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.id = member_association_affiliations.club_member_id
      AND public.is_club_admin(auth.uid(), cm.club_id)
  ));

CREATE TRIGGER member_association_affiliations_updated_at
  BEFORE UPDATE ON public.member_association_affiliations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-set deactivated_at when active flips false
CREATE OR REPLACE FUNCTION public.set_affiliation_deactivated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.active = false AND (OLD.active IS DISTINCT FROM false) THEN
    NEW.deactivated_at := now();
  ELSIF NEW.active = true AND (OLD.active IS DISTINCT FROM true) THEN
    NEW.deactivated_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_affiliation_deactivated_at
  BEFORE UPDATE ON public.member_association_affiliations
  FOR EACH ROW EXECUTE FUNCTION public.set_affiliation_deactivated_at();

-- Backfill from any existing member_league_registrations rows that already
-- have a league_association_number. This rescues numbers like Vian's LS one
-- that are currently only stored on team-level registration rows.
INSERT INTO public.member_association_affiliations
  (club_member_id, association_id, league_association_number, active, joined_at)
SELECT DISTINCT ON (mlr.club_member_id, l.association_id)
  mlr.club_member_id,
  l.association_id,
  mlr.league_association_number,
  true,
  COALESCE(mlr.created_at, now())
FROM public.member_league_registrations mlr
JOIN public.leagues l ON l.id = mlr.league_id
WHERE mlr.league_association_number IS NOT NULL
  AND l.association_id IS NOT NULL
ORDER BY mlr.club_member_id, l.association_id, mlr.created_at ASC
ON CONFLICT (club_member_id, association_id) DO NOTHING;