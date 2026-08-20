ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS season_year integer NULL,
  ADD COLUMN IF NOT EXISTS level integer NULL,
  ADD COLUMN IF NOT EXISTS is_reserve boolean NULL,
  ADD COLUMN IF NOT EXISTS level_source text NULL,
  ADD COLUMN IF NOT EXISTS season_source text NULL;

COMMENT ON COLUMN public.leagues.season_year IS 'Competition year this league/team row belongs to. NULL = unknown; readers fall back to inference.';
COMMENT ON COLUMN public.leagues.level IS 'Canonical league level (1 = First League). Display names are labels only.';
COMMENT ON COLUMN public.leagues.is_reserve IS 'True when this row is a reserves squad for its level. NULL = unknown (name inference applies).';
COMMENT ON COLUMN public.leagues.level_source IS 'fixtures | name | manual | backfill — provenance of level/is_reserve.';
COMMENT ON COLUMN public.leagues.season_source IS 'rounds | manual | backfill — provenance of season_year.';

CREATE INDEX IF NOT EXISTS leagues_club_season_level_idx
  ON public.leagues (club_id, season_year, level);
