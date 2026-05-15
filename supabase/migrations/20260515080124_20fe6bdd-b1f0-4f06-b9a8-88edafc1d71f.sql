ALTER TABLE public.league_rules
  ADD COLUMN IF NOT EXISTS team_size_mode text NOT NULL DEFAULT 'fixed'
    CHECK (team_size_mode IN ('fixed','flexible')),
  ADD COLUMN IF NOT EXISTS team_size integer NOT NULL DEFAULT 4
    CHECK (team_size BETWEEN 1 AND 8);