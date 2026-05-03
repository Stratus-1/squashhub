ALTER TABLE public.club_champs ADD COLUMN IF NOT EXISTS source_league_ids uuid[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_club_champs_source_league_ids ON public.club_champs USING GIN (source_league_ids);

-- Backfill from existing single column
UPDATE public.club_champs
SET source_league_ids = ARRAY[source_league_id]
WHERE source_league_id IS NOT NULL AND (source_league_ids = '{}' OR source_league_ids IS NULL);