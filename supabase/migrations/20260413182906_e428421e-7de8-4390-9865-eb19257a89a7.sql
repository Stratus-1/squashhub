ALTER TABLE public.league_fixture_results
ADD COLUMN IF NOT EXISTS match_format jsonb DEFAULT '{"scoringFormat":"par11","bestOf":5}'::jsonb;