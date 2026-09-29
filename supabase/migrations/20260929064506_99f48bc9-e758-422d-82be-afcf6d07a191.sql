ALTER TABLE public.team_league_events
  ADD COLUMN IF NOT EXISTS tournament_id uuid REFERENCES public.tournaments(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS team_league_events_tournament_uidx
  ON public.team_league_events(tournament_id) WHERE tournament_id IS NOT NULL;