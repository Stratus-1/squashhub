REVOKE ALL ON FUNCTION public.can_host_at_club(uuid, uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_host_at_club(uuid, uuid) TO authenticated;