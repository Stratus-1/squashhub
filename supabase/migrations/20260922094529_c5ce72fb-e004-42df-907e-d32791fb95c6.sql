ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS division_follows jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS division_pairing_method jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS pool_durations jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.tournaments.division_follows IS 'group_number -> group_number this division must wait for (stage sequencing)';
COMMENT ON COLUMN public.tournaments.division_pairing_method IS 'group_number -> adjacent | balanced | manual (how doubles pairs are built from the preceding division order)';
COMMENT ON COLUMN public.tournaments.pool_durations IS '"group:pool" -> minutes override for timed games';