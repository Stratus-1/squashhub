
ALTER TABLE public.platform_league_fixtures
  ADD COLUMN IF NOT EXISTS nsa_fixture_id integer,
  ADD COLUMN IF NOT EXISTS nsa_submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS nsa_submitted_by uuid REFERENCES public.club_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS nsa_submission_notes text;

CREATE INDEX IF NOT EXISTS idx_platform_league_fixtures_nsa_fixture_id
  ON public.platform_league_fixtures (nsa_fixture_id) WHERE nsa_fixture_id IS NOT NULL;
