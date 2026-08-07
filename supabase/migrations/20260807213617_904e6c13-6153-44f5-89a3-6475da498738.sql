REVOKE EXECUTE ON FUNCTION public.register_doubles_pair(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_doubles_pair(uuid, uuid, uuid) TO authenticated;