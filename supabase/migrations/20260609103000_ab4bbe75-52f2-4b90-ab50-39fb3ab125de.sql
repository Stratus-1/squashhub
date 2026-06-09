ALTER TABLE public.platform_league_associations
  ADD COLUMN IF NOT EXISTS is_internal boolean NOT NULL DEFAULT false;

UPDATE public.platform_league_associations
  SET is_internal = true
  WHERE id = '3b0ca049-ee95-4773-9a1c-d67ddf2e2d3a';