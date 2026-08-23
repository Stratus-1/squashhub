REVOKE SELECT, INSERT, UPDATE, DELETE ON public.league_marker_locks FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_access_league_fixture(uuid, uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_league_fixture(uuid, uuid) TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.league_marker_locks TO authenticated;
GRANT ALL ON public.league_marker_locks TO service_role;