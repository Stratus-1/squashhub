CREATE TABLE public.league_fixture_lineups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id uuid NOT NULL REFERENCES public.platform_league_fixtures(id) ON DELETE CASCADE,
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position BETWEEN 1 AND 4),
  club_member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES public.club_members(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fixture_id, league_id, position),
  UNIQUE (fixture_id, league_id, club_member_id)
);

CREATE INDEX idx_lineups_fixture ON public.league_fixture_lineups(fixture_id);
CREATE INDEX idx_lineups_league ON public.league_fixture_lineups(league_id);
CREATE INDEX idx_lineups_club ON public.league_fixture_lineups(club_id);

ALTER TABLE public.league_fixture_lineups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "League players can view lineups for their club"
ON public.league_fixture_lineups
FOR SELECT TO authenticated
USING (is_club_member(auth.uid(), club_id));

CREATE POLICY "League-registered players or admins can insert lineups"
ON public.league_fixture_lineups
FOR INSERT TO authenticated
WITH CHECK (
  is_club_admin(auth.uid(), club_id)
  OR EXISTS (
    SELECT 1 FROM public.member_league_registrations mlr
    JOIN public.club_members cm ON cm.id = mlr.club_member_id
    WHERE mlr.league_id = league_fixture_lineups.league_id
      AND cm.user_id = auth.uid()
  )
);

CREATE POLICY "League-registered players or admins can update lineups"
ON public.league_fixture_lineups
FOR UPDATE TO authenticated
USING (
  is_club_admin(auth.uid(), club_id)
  OR EXISTS (
    SELECT 1 FROM public.member_league_registrations mlr
    JOIN public.club_members cm ON cm.id = mlr.club_member_id
    WHERE mlr.league_id = league_fixture_lineups.league_id
      AND cm.user_id = auth.uid()
  )
);

CREATE POLICY "League-registered players or admins can delete lineups"
ON public.league_fixture_lineups
FOR DELETE TO authenticated
USING (
  is_club_admin(auth.uid(), club_id)
  OR EXISTS (
    SELECT 1 FROM public.member_league_registrations mlr
    JOIN public.club_members cm ON cm.id = mlr.club_member_id
    WHERE mlr.league_id = league_fixture_lineups.league_id
      AND cm.user_id = auth.uid()
  )
);

CREATE TRIGGER league_fixture_lineups_updated_at
BEFORE UPDATE ON public.league_fixture_lineups
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();