REVOKE ALL ON FUNCTION public.create_league_season(uuid, integer, text, date, date, boolean, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_league_season(uuid, integer, text, date, date, boolean, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_league_season(uuid, integer, text, date, date, boolean, boolean) TO authenticated;