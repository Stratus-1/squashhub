ALTER TABLE public.leagues ADD COLUMN IF NOT EXISTS division text;

COMMENT ON COLUMN public.leagues.division IS 'Competition/division label (e.g. "Mens 2nd", "Ladies 1st"). Additive Phase 2.1 field: team codes are NOT globally unique across competitions.';

DROP INDEX IF EXISTS public.leagues_assoc_season_code_uniq;

CREATE UNIQUE INDEX leagues_assoc_season_div_code_uniq
  ON public.leagues (association_id, season_id, (coalesce(division, '')), code)
  WHERE season_id IS NOT NULL AND code IS NOT NULL;

CREATE UNIQUE INDEX leagues_assoc_season_nsa_code_uniq
  ON public.leagues (association_id, season_id, nsa_team_code)
  WHERE season_id IS NOT NULL AND nsa_team_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS leagues_nsa_team_code_idx ON public.leagues (nsa_team_code) WHERE nsa_team_code IS NOT NULL;