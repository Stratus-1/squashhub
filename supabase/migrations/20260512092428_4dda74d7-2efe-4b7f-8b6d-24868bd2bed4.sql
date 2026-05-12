ALTER TABLE public.league_rules
  ADD COLUMN IF NOT EXISTS team_win_bonus_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS team_win_bonus_value numeric NOT NULL DEFAULT 2;