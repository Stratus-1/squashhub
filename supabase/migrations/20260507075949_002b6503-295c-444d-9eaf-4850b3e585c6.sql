ALTER TABLE public.league_rounds
ADD COLUMN IF NOT EXISTS play_dows integer[] NOT NULL DEFAULT '{}'::integer[];