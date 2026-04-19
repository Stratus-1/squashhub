-- Add scope to league_associations: 'internal' (club-only, no API) or 'region' (regional/external)
ALTER TABLE public.league_associations
ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'region';

-- Constrain values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'league_associations_scope_check'
  ) THEN
    ALTER TABLE public.league_associations
    ADD CONSTRAINT league_associations_scope_check
    CHECK (scope IN ('internal', 'region'));
  END IF;
END $$;

-- Backfill: any existing association linked to a platform association is regional
UPDATE public.league_associations
SET scope = 'region'
WHERE platform_association_id IS NOT NULL AND scope IS DISTINCT FROM 'region';