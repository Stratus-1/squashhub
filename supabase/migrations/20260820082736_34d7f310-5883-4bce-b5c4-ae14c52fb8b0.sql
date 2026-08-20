ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS league_sources jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS league_source_modes jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.tournaments.league_sources IS 'Per competition division (keyed by group_number as text): array of club league ids whose players may enter that division.';
COMMENT ON COLUMN public.tournaments.league_source_modes IS 'Per competition division (keyed by group_number as text): "all" | "selected" | "combined". Combined means the selected leagues are deliberately mixed into one draw.';