ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS division_seed_source jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.tournaments.division_seed_source IS 'group_number -> previous | ladder (how a staged division is seeded)';

DO $$
DECLARE d text;
BEGIN
  SELECT pg_get_viewdef('public.club_champs'::regclass, true) INTO d;
  IF position('division_seed_source' in d) = 0 THEN
    d := replace(d, 't.pool_durations', 't.pool_durations,' || chr(10) || '    t.division_seed_source');
    EXECUTE 'CREATE OR REPLACE VIEW public.club_champs AS ' || d;
  END IF;
END $$;