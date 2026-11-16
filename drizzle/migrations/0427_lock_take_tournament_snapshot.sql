REVOKE EXECUTE ON FUNCTION public.take_tournament_snapshot(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.take_tournament_snapshot(uuid, text) TO service_role;
COMMENT ON FUNCTION public.take_tournament_snapshot(uuid, text) IS 'Internal backup helper: service-role/maintenance only, not callable by signed-in users.';