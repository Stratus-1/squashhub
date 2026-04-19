-- Per-league week start day. NULL = inherit from clubs.league_week_start_dow
ALTER TABLE public.league_associations
ADD COLUMN IF NOT EXISTS week_start_dow smallint NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'league_associations_week_start_dow_check'
  ) THEN
    ALTER TABLE public.league_associations
    ADD CONSTRAINT league_associations_week_start_dow_check
    CHECK (week_start_dow IS NULL OR (week_start_dow BETWEEN 0 AND 6));
  END IF;
END $$;