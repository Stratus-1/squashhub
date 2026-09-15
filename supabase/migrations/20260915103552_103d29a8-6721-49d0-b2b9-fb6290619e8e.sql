
REVOKE EXECUTE ON FUNCTION public.can_manage_family_group(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.family_add_member(uuid, uuid, text, text, text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.family_remove_member(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.family_resolve_category_change(uuid, boolean) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.can_manage_family_group(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.family_add_member(uuid, uuid, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.family_remove_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.family_resolve_category_change(uuid, boolean) TO authenticated;
