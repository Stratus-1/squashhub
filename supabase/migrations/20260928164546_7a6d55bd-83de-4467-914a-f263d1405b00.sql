ALTER TABLE public.league_rules ADD COLUMN IF NOT EXISTS doubles_serving_method text;
ALTER TABLE public.league_rules DROP CONSTRAINT IF EXISTS league_rules_doubles_serving_method_chk;
ALTER TABLE public.league_rules ADD CONSTRAINT league_rules_doubles_serving_method_chk
  CHECK (doubles_serving_method IS NULL OR doubles_serving_method IN ('even_odd','by_position','second_server'));

ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS doubles_serving_method text;
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS league_doubles_serving_methods jsonb;
ALTER TABLE public.tournaments DROP CONSTRAINT IF EXISTS tournaments_doubles_serving_method_chk;
ALTER TABLE public.tournaments ADD CONSTRAINT tournaments_doubles_serving_method_chk
  CHECK (doubles_serving_method IS NULL OR doubles_serving_method IN ('even_odd','by_position','second_server'));