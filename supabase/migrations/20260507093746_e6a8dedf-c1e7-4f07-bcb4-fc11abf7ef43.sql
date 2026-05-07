-- Add reserve support to league registrations
ALTER TABLE public.member_league_registrations
  ADD COLUMN IF NOT EXISTS is_reserve boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reserve_order integer;

CREATE INDEX IF NOT EXISTS idx_mlr_reserve
  ON public.member_league_registrations (league_id, is_reserve, reserve_order);

-- Track desired reserves-per-team on each league config
ALTER TABLE public.leagues
  ADD COLUMN IF NOT EXISTS reserves_per_team integer NOT NULL DEFAULT 0;