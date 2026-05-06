-- Allow nsa_seeded as a tenant_type
ALTER TABLE public.clubs
  DROP CONSTRAINT IF EXISTS clubs_tenant_type_check;

ALTER TABLE public.clubs
  ADD CONSTRAINT clubs_tenant_type_check
  CHECK (tenant_type IN ('club', 'association', 'nsa_seeded'));

-- Free-tier window (NSA-seeded clubs are free until this date unless an admin
-- formally takes over the club, in which case the subscription kicks in).
ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS free_tier_until date,
  ADD COLUMN IF NOT EXISTS nsa_club_id text;

CREATE INDEX IF NOT EXISTS idx_clubs_nsa_club_id
  ON public.clubs(nsa_club_id) WHERE nsa_club_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clubs_free_tier_until
  ON public.clubs(free_tier_until) WHERE free_tier_until IS NOT NULL;

-- Track NSA team identity on each pre-seeded league row
ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS nsa_team_id text,
  ADD COLUMN IF NOT EXISTS nsa_team_code text;

CREATE INDEX IF NOT EXISTS idx_leagues_nsa_team_id
  ON public.leagues(nsa_team_id) WHERE nsa_team_id IS NOT NULL;

COMMENT ON COLUMN public.clubs.tenant_type IS
  'club = full paying tenant; association = league body (NSA, LS); nsa_seeded = auto-created from NSA API, free until free_tier_until or until a club admin formally takes over.';

COMMENT ON COLUMN public.clubs.free_tier_until IS
  'NSA-seeded clubs are free until this date. After the date OR after a member is granted club admin rights, the club converts to paid (tenant_type becomes club).';