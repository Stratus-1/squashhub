ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS league_playoff_modes jsonb,
  ADD COLUMN IF NOT EXISTS league_playoff_qualifiers jsonb,
  ADD COLUMN IF NOT EXISTS rotation_max_matches integer;

COMMENT ON COLUMN public.tournaments.league_playoff_modes IS 'Per-division post-pool playoff style: {"1":"position"|"knockout"}. Null/absent = position (legacy behaviour).';
COMMENT ON COLUMN public.tournaments.league_playoff_qualifiers IS 'Per-division qualifiers per pool for knockout playoffs: {"1":2}.';
COMMENT ON COLUMN public.tournaments.rotation_max_matches IS 'Rotating-partner doubles: maximum matches any single player may be scheduled for. Null = full rotation (no limit).';