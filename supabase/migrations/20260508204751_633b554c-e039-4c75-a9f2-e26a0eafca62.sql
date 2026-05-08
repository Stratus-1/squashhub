ALTER TABLE public.league_rules
  ADD COLUMN IF NOT EXISTS enforce_sub_rules boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS max_position_movement_per_week integer NULL,
  ADD COLUMN IF NOT EXISTS sub_direction text NOT NULL DEFAULT 'any',
  ADD COLUMN IF NOT EXISTS cross_gender_subs_allowed boolean NOT NULL DEFAULT false;

ALTER TABLE public.league_rules DROP CONSTRAINT IF EXISTS league_rules_sub_direction_check;
ALTER TABLE public.league_rules
  ADD CONSTRAINT league_rules_sub_direction_check
  CHECK (sub_direction IN ('any', 'lower_or_equal_only', 'higher_or_equal_only'));