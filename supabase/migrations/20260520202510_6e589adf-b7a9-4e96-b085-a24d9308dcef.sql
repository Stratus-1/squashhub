ALTER TABLE public.league_rules ALTER COLUMN points_per_game DROP DEFAULT;
UPDATE public.league_rules SET points_per_game = NULL WHERE points_per_game = 11;