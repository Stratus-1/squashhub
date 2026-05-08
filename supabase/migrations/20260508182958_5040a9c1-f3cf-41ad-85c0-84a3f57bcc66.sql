
ALTER TABLE public.platform_league_associations
  ADD COLUMN IF NOT EXISTS external_source text,
  ADD COLUMN IF NOT EXISTS external_season text,
  ADD COLUMN IF NOT EXISTS last_fixtures_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_fixtures_sync_summary text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_league_fixtures_assoc_external
  ON public.platform_league_fixtures (association_id, external_id)
  WHERE external_id IS NOT NULL;

UPDATE public.platform_league_associations
   SET external_source = COALESCE(external_source, 'nsa'),
       external_season = COALESCE(external_season, 's79')
 WHERE lower(name) LIKE '%northern%squash%' OR short_code ILIKE 'nsa%';
