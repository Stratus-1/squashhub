ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS builder_architecture text NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS builder_spec jsonb,
  ADD COLUMN IF NOT EXISTS builder_spec_version integer NOT NULL DEFAULT 0;
ALTER TABLE public.tournaments DROP CONSTRAINT IF EXISTS tournaments_builder_architecture_chk;
ALTER TABLE public.tournaments ADD CONSTRAINT tournaments_builder_architecture_chk CHECK (builder_architecture IN ('legacy','structured'));