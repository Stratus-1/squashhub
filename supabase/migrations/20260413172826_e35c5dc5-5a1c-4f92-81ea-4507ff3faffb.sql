-- Individual match results per position
CREATE TABLE public.league_match_results (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fixture_id uuid NOT NULL REFERENCES public.platform_league_fixtures(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position BETWEEN 1 AND 4),
  home_player_code text,
  away_player_code text,
  home_player_name text,
  away_player_name text,
  game_scores jsonb DEFAULT '[]'::jsonb,
  home_games_won integer NOT NULL DEFAULT 0,
  away_games_won integer NOT NULL DEFAULT 0,
  winner text CHECK (winner IN ('home', 'away', null)),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(fixture_id, position)
);

-- Fixture-level summary
CREATE TABLE public.league_fixture_results (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fixture_id uuid NOT NULL UNIQUE REFERENCES public.platform_league_fixtures(id) ON DELETE CASCADE,
  home_total_games integer NOT NULL DEFAULT 0,
  away_total_games integer NOT NULL DEFAULT 0,
  home_bonus_points integer NOT NULL DEFAULT 0,
  away_bonus_points integer NOT NULL DEFAULT 0,
  home_total_points integer NOT NULL DEFAULT 0,
  away_total_points integer NOT NULL DEFAULT 0,
  winner text CHECK (winner IN ('home', 'away', 'draw', null)),
  status text NOT NULL DEFAULT 'draft',
  home_captain_signature text,
  away_captain_signature text,
  submitted_by uuid,
  submitted_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.league_match_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.league_fixture_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view league match results"
  ON public.league_match_results FOR SELECT TO authenticated USING (true);
CREATE POLICY "Platform admins can manage league match results"
  ON public.league_match_results FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated users can insert league match results"
  ON public.league_match_results FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update league match results"
  ON public.league_match_results FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can view league fixture results"
  ON public.league_fixture_results FOR SELECT TO authenticated USING (true);
CREATE POLICY "Platform admins can manage league fixture results"
  ON public.league_fixture_results FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated users can insert league fixture results"
  ON public.league_fixture_results FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update league fixture results"
  ON public.league_fixture_results FOR UPDATE TO authenticated USING (true);