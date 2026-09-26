REVOKE EXECUTE ON FUNCTION public.guard_suspended_member_booking() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.member_access_blocked(uuid, uuid, uuid) FROM authenticated;