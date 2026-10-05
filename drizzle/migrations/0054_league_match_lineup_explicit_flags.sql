ALTER TABLE public.league_match_results
  ADD COLUMN IF NOT EXISTS home_lineup_explicit boolean,
  ADD COLUMN IF NOT EXISTS away_lineup_explicit boolean;
COMMENT ON COLUMN public.league_match_results.home_lineup_explicit IS 'true = home side was explicitly chosen for this match (authoritative); false = saved copy of the team default roster (re-resolved from current roster while unplayed); NULL = legacy/unknown.';
COMMENT ON COLUMN public.league_match_results.away_lineup_explicit IS 'See home_lineup_explicit.';