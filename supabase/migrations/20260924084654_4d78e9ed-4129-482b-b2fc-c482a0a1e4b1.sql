REVOKE EXECUTE ON FUNCTION public.can_use_ai_actions(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.can_use_ai_actions(uuid, uuid) TO service_role;