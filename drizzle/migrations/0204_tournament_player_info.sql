ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS player_info text;
COMMENT ON COLUMN public.tournaments.player_info IS 'Admin-written additional information shown to tournament players.';