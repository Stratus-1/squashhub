ALTER TABLE public.member_league_registrations
  ADD COLUMN IF NOT EXISTS shadow_division integer,
  ADD COLUMN IF NOT EXISTS shadow_player_rank integer;

COMMENT ON COLUMN public.member_league_registrations.shadow_division IS
  'For reserve registrations: the league division (1=strongest) the admin shadow-ranks this reserve into, used by league-rank handicap calculations.';
COMMENT ON COLUMN public.member_league_registrations.shadow_player_rank IS
  'For reserve registrations: the in-division slot (1..N) the admin shadow-ranks this reserve at. May exceed permanent team size to denote a weaker player.';