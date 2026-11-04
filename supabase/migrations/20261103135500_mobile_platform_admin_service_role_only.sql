-- Admin inspection calls originate only from the trusted Player API.
-- PUBLIC revocation alone does not remove explicit default grants in this project.
REVOKE ALL ON FUNCTION public.mobile_platform_admin_clubs(text, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mobile_platform_admin_club_overview(text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_platform_admin_clubs(text, uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.mobile_platform_admin_club_overview(text, uuid, uuid)
  TO service_role;

NOTIFY pgrst, 'reload schema';
