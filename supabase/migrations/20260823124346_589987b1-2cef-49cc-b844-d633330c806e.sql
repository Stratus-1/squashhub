
-- 1. ROUND UNIQUENESS: season-aware
ALTER TABLE public.league_rounds
  DROP CONSTRAINT IF EXISTS league_rounds_association_id_round_number_key;

CREATE UNIQUE INDEX IF NOT EXISTS league_rounds_assoc_season_round_uniq
  ON public.league_rounds (association_id, season_id, round_number)
  WHERE season_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS league_rounds_assoc_noseason_round_uniq
  ON public.league_rounds (association_id, round_number)
  WHERE season_id IS NULL;

-- 2. STABLE TEAM REFERENCES + HISTORICAL NAME SNAPSHOTS
ALTER TABLE public.platform_league_fixtures
  ADD COLUMN IF NOT EXISTS home_team_id uuid,
  ADD COLUMN IF NOT EXISTS away_team_id uuid,
  ADD COLUMN IF NOT EXISTS home_team_name_snapshot text,
  ADD COLUMN IF NOT EXISTS away_team_name_snapshot text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'platform_league_fixtures_home_team_id_fkey') THEN
    ALTER TABLE public.platform_league_fixtures
      ADD CONSTRAINT platform_league_fixtures_home_team_id_fkey
      FOREIGN KEY (home_team_id) REFERENCES public.leagues(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'platform_league_fixtures_away_team_id_fkey') THEN
    ALTER TABLE public.platform_league_fixtures
      ADD CONSTRAINT platform_league_fixtures_away_team_id_fkey
      FOREIGN KEY (away_team_id) REFERENCES public.leagues(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS platform_league_fixtures_home_team_id_idx
  ON public.platform_league_fixtures (home_team_id);
CREATE INDEX IF NOT EXISTS platform_league_fixtures_away_team_id_idx
  ON public.platform_league_fixtures (away_team_id);

-- 3. SEASON-TEAM CODE SAFETY (only for season-scoped teams; legacy NULL-season rows untouched)
CREATE UNIQUE INDEX IF NOT EXISTS leagues_assoc_season_code_uniq
  ON public.leagues (association_id, season_id, code)
  WHERE season_id IS NOT NULL AND code IS NOT NULL;
