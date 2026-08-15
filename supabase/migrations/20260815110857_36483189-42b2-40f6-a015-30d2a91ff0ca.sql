ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS league_genders jsonb,
  ADD COLUMN IF NOT EXISTS league_match_types jsonb;

COMMENT ON COLUMN public.tournaments.league_genders IS 'Per-league gender category keyed by league number, e.g. {"1":"ladies","2":"men"}. Null/missing falls back to tournaments.gender.';
COMMENT ON COLUMN public.tournaments.league_match_types IS 'Per-league match type keyed by league number, e.g. {"1":"singles"}. Null/missing falls back to tournaments.match_type.';