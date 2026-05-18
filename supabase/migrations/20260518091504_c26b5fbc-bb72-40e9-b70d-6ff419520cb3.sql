ALTER TABLE public.league_week_lineups REPLICA IDENTITY FULL;
ALTER TABLE public.league_week_unavailability REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.league_week_lineups;
ALTER PUBLICATION supabase_realtime ADD TABLE public.league_week_unavailability;