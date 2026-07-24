ALTER TABLE public.club_champs_matches REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.club_champs_matches;