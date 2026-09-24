REVOKE EXECUTE ON FUNCTION public.can_use_tournament_beta(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_use_tournament_beta(uuid, uuid) TO authenticated, service_role;