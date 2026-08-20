ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS invite_audience text NOT NULL DEFAULT 'all_club',
  ADD COLUMN IF NOT EXISTS invite_audience_league_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS invite_audience_member_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS invite_audience_include_individuals boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tournaments_invite_audience_check'
  ) THEN
    ALTER TABLE public.tournaments
      ADD CONSTRAINT tournaments_invite_audience_check
      CHECK (invite_audience IN ('all_club','leagues','individuals'));
  END IF;
END $$;