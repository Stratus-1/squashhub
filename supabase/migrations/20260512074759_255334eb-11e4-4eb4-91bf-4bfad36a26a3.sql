ALTER TABLE public.league_match_results REPLICA IDENTITY FULL;
ALTER TABLE public.league_fixture_results REPLICA IDENTITY FULL;
DO $$ BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.league_match_results;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.league_fixture_results;
  EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;