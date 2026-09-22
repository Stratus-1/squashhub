ALTER TABLE public.tournament_venues
  ADD COLUMN IF NOT EXISTS host_fee_basis text NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS host_fee_qty numeric NOT NULL DEFAULT 0;

ALTER TABLE public.tournament_venues
  DROP CONSTRAINT IF EXISTS tournament_venues_host_fee_basis_chk;

ALTER TABLE public.tournament_venues
  ADD CONSTRAINT tournament_venues_host_fee_basis_chk
  CHECK (host_fee_basis IN ('fixed', 'per_court_hour', 'per_day'));