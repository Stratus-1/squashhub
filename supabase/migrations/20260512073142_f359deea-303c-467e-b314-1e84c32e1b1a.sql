ALTER TABLE public.league_rules
  ADD COLUMN IF NOT EXISTS original_player_bonus_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS original_player_bonus_value integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.league_rules.original_player_bonus_enabled IS 'When true, each originally-allocated player who actually plays earns the team an extra bonus point. Reserves/subs do not earn this bonus. (NIL rule)';
COMMENT ON COLUMN public.league_rules.original_player_bonus_value IS 'Points awarded per original (non-reserve) player who appears in the fixture lineup.';