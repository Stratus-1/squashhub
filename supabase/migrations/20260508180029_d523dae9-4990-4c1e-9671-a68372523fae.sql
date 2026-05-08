ALTER TABLE public.league_rules
  DROP CONSTRAINT IF EXISTS league_rules_association_id_fkey;

ALTER TABLE public.league_rules
  ADD CONSTRAINT league_rules_association_id_fkey
  FOREIGN KEY (association_id)
  REFERENCES public.platform_league_associations(id)
  ON DELETE CASCADE;

ALTER TABLE public.league_rules
  ADD COLUMN IF NOT EXISTS tiebreak_method text NOT NULL DEFAULT 'games_then_points_then_share',
  ADD COLUMN IF NOT EXISTS bonus_points_mode text NOT NULL DEFAULT 'per_match',
  ADD COLUMN IF NOT EXISTS bonus_points_value integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS share_bonus_on_tie boolean NOT NULL DEFAULT true;

ALTER TABLE public.league_rules
  DROP CONSTRAINT IF EXISTS league_rules_tiebreak_method_check;
ALTER TABLE public.league_rules
  ADD CONSTRAINT league_rules_tiebreak_method_check
  CHECK (tiebreak_method IN ('games_then_points_then_share','games_only','points_only'));

ALTER TABLE public.league_rules
  DROP CONSTRAINT IF EXISTS league_rules_bonus_points_mode_check;
ALTER TABLE public.league_rules
  ADD CONSTRAINT league_rules_bonus_points_mode_check
  CHECK (bonus_points_mode IN ('none','per_match','per_game_won'));