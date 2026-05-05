ALTER TABLE public.leagues
ADD COLUMN IF NOT EXISTS nsa_team_id TEXT;

COMMENT ON COLUMN public.leagues.nsa_team_id IS
'NSA team identifier (from admin.northerns.co.za). When set, the League Game Detail page fetches the live roster and W/L stats from NSA via the nsa-proxy edge function.';