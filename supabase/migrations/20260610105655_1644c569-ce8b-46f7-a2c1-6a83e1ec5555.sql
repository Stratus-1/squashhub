ALTER TABLE public.club_champs
  ADD COLUMN IF NOT EXISTS invite_source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS invite_include_reserves boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS invite_excluded_member_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS handicap_mode text NOT NULL DEFAULT 'none';

ALTER TABLE public.club_champs
  DROP CONSTRAINT IF EXISTS club_champs_invite_source_check;
ALTER TABLE public.club_champs
  ADD CONSTRAINT club_champs_invite_source_check
  CHECK (invite_source IN ('manual','leagues'));

ALTER TABLE public.club_champs
  DROP CONSTRAINT IF EXISTS club_champs_handicap_mode_check;
ALTER TABLE public.club_champs
  ADD CONSTRAINT club_champs_handicap_mode_check
  CHECK (handicap_mode IN ('none','league_rank'));

ALTER TABLE public.club_champs_matches
  ADD COLUMN IF NOT EXISTS handicap_a integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS handicap_b integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS handicap_locked boolean NOT NULL DEFAULT false;