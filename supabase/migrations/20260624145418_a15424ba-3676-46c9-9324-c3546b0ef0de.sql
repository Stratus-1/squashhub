ALTER TABLE public.club_champs
  ADD COLUMN IF NOT EXISTS no_show_opponent_points integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS no_show_player_points integer NOT NULL DEFAULT 0;

ALTER TABLE public.club_champs_matches
  ADD COLUMN IF NOT EXISTS forfeit_member_id uuid NULL REFERENCES public.club_members(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.club_champs.no_show_opponent_points IS 'Points awarded to the opponent when a player is marked No Show / Injured.';
COMMENT ON COLUMN public.club_champs.no_show_player_points  IS 'Points recorded for the player who could not play (no-show / injured).';
COMMENT ON COLUMN public.club_champs_matches.forfeit_member_id IS 'Member who forfeited (no-show / injured). Opponent receives the no_show_opponent_points configured on the tournament.';
