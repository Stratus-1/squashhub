
-- NSA per-rubber history scraped from fixtureresults.php
CREATE TABLE IF NOT EXISTS public.nsa_rubber_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nsa_fixture_id INTEGER NOT NULL,
  fixture_date DATE NOT NULL,
  category TEXT,
  league_label TEXT,
  nsa_league_id INTEGER,
  round INTEGER,
  team_code TEXT NOT NULL,
  is_home BOOLEAN NOT NULL,
  position SMALLINT NOT NULL CHECK (position BETWEEN 1 AND 4),
  player_code TEXT NOT NULL,
  player_name TEXT,
  points_for INTEGER,
  games_for INTEGER,
  rubbers_for INTEGER,
  points_against INTEGER,
  games_against INTEGER,
  rubbers_against INTEGER,
  won BOOLEAN,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (nsa_fixture_id, team_code, position)
);

CREATE INDEX IF NOT EXISTS idx_nsa_rubber_history_player ON public.nsa_rubber_history (player_code, fixture_date DESC);
CREATE INDEX IF NOT EXISTS idx_nsa_rubber_history_team ON public.nsa_rubber_history (team_code, fixture_date DESC);
CREATE INDEX IF NOT EXISTS idx_nsa_rubber_history_fixture ON public.nsa_rubber_history (nsa_fixture_id);

ALTER TABLE public.nsa_rubber_history ENABLE ROW LEVEL SECURITY;

-- Public NSA data: any authenticated app user can read
CREATE POLICY "Authenticated can read NSA rubber history"
  ON public.nsa_rubber_history FOR SELECT
  TO authenticated
  USING (true);

-- Only service role (edge functions) can write; no client write policies.
