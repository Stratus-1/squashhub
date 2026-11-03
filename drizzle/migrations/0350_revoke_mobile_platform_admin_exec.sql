-- Tighten EXECUTE on mobile platform-admin functions: service_role only.
REVOKE EXECUTE ON FUNCTION public.mobile_platform_admin_clubs(text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mobile_platform_admin_club_overview(text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_platform_admin_clubs(text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mobile_platform_admin_club_overview(text, uuid, uuid) TO service_role;
