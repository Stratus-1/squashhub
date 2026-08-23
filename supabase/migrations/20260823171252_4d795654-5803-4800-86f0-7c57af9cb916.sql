ALTER TABLE public.league_rules DROP CONSTRAINT league_rules_team_size_check;
ALTER TABLE public.league_rules ADD CONSTRAINT league_rules_team_size_check CHECK (team_size >= 1 AND team_size <= 24);