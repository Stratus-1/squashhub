ALTER TABLE public.league_rules
  ADD COLUMN IF NOT EXISTS allow_multi_fixture_per_night boolean NOT NULL DEFAULT false;