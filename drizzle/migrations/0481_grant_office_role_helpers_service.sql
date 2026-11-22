
grant execute on function public.office_role_defaults(text) to service_role;
grant execute on function public.office_to_role_name(text) to service_role;
grant execute on function public.snapshot_club_permissions(uuid, text) to service_role;
grant execute on function public.club_permission_review(uuid) to service_role;
grant execute on function public.ensure_office_role_templates(uuid) to service_role;
grant execute on function public.apply_office_role(uuid, text, boolean) to service_role;
grant execute on function public.restore_permission_snapshot(uuid) to service_role;
