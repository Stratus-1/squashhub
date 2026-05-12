ALTER TABLE public.league_rules DROP CONSTRAINT IF EXISTS league_rules_bonus_points_mode_check;
ALTER TABLE public.league_rules ADD CONSTRAINT league_rules_bonus_points_mode_check
  CHECK (bonus_points_mode IN ('none','per_match','per_game_won','fixed_winner'));