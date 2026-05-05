
ALTER TABLE public.league_associations
  ADD COLUMN IF NOT EXISTS external_source TEXT,
  ADD COLUMN IF NOT EXISTS external_club_id TEXT;

ALTER TABLE public.platform_league_fixtures
  ADD COLUMN IF NOT EXISTS external_id TEXT;

CREATE INDEX IF NOT EXISTS idx_platform_league_fixtures_external_id
  ON public.platform_league_fixtures(external_id)
  WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_league_associations_external_source
  ON public.league_associations(external_source)
  WHERE external_source IS NOT NULL;

-- Backfill: CSIR's NSA association
UPDATE public.league_associations
SET external_source = 'nsa', external_club_id = '6'
WHERE id = 'ff79125c-1c69-4a1a-a5bb-6e0724a493b8';
