ALTER TABLE public.club_champs_entries ADD COLUMN IF NOT EXISTS pool_number integer;
ALTER TABLE public.tournaments ADD COLUMN IF NOT EXISTS pool_sizes jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.club_champs_entries.pool_number IS 'Explicit 1-based pool the entrant sits in. NULL = derive from order_index.';
COMMENT ON COLUMN public.tournaments.pool_sizes IS 'Per-division custom pool sizes: {"1":[5,4], ...}. Empty = auto-balanced.';