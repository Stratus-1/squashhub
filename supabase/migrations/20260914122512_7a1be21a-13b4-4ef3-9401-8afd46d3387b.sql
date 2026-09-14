ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS draft_player_ids uuid[];

COMMENT ON COLUMN public.tournaments.draft_player_ids IS
  'Player roster selected by an organiser while the tournament wizard is still a draft; final club_champs_entries allocations remain authoritative.';