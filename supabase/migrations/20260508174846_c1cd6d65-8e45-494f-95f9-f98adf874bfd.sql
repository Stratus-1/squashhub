
CREATE TABLE public.league_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL UNIQUE REFERENCES public.leagues(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  points_per_game int NOT NULL DEFAULT 11,
  win_by int NOT NULL DEFAULT 2,
  games_format text NOT NULL DEFAULT 'best_of_5' CHECK (games_format IN ('best_of_3','best_of_5','best_of_7')),
  tiebreak_at int,
  let_stroke_enabled boolean NOT NULL DEFAULT true,
  max_timeouts_per_player int NOT NULL DEFAULT 1,
  marker_required boolean NOT NULL DEFAULT true,
  marker_must_be_qualified boolean NOT NULL DEFAULT true,
  forfeit_allowed boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.league_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Club members can view league rules"
  ON public.league_rules FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.club_members cm WHERE cm.club_id = league_rules.club_id AND cm.user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Club admins can manage league rules"
  ON public.league_rules FOR ALL
  USING (public.is_club_admin(auth.uid(), league_rules.club_id) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_club_admin(auth.uid(), league_rules.club_id) OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_league_rules_updated_at
  BEFORE UPDATE ON public.league_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.seed_default_league_rules()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.league_rules (league_id, club_id) VALUES (NEW.id, NEW.club_id)
  ON CONFLICT (league_id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_seed_default_league_rules
  AFTER INSERT ON public.leagues
  FOR EACH ROW EXECUTE FUNCTION public.seed_default_league_rules();

INSERT INTO public.league_rules (league_id, club_id)
SELECT id, club_id FROM public.leagues ON CONFLICT (league_id) DO NOTHING;

CREATE TABLE public.league_fixture_penalties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id text NOT NULL,
  league_id uuid REFERENCES public.leagues(id) ON DELETE CASCADE,
  club_id uuid REFERENCES public.clubs(id) ON DELETE CASCADE,
  team_side text NOT NULL CHECK (team_side IN ('home','away')),
  team_name text,
  nsa_team_id int,
  penalty_points int NOT NULL DEFAULT 0,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  scraped_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(fixture_id, team_side)
);

CREATE INDEX idx_lfp_league ON public.league_fixture_penalties(league_id);
CREATE INDEX idx_lfp_club ON public.league_fixture_penalties(club_id);

ALTER TABLE public.league_fixture_penalties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Club members can view fixture penalties"
  ON public.league_fixture_penalties FOR SELECT
  USING (
    club_id IS NULL
    OR EXISTS (SELECT 1 FROM public.club_members cm WHERE cm.club_id = league_fixture_penalties.club_id AND cm.user_id = auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );
