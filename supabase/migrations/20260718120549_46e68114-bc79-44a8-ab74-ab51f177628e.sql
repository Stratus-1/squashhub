REVOKE ALL ON FUNCTION public.delete_league_round_cascade(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_league_round_cascade(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_league_round_cascade(uuid) TO authenticated;