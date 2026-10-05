CREATE OR REPLACE FUNCTION public.is_club_secrets_admin(_user_id uuid, _club_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.has_role(_user_id, 'admin'::public.app_role)
    OR EXISTS (SELECT 1 FROM public.club_members WHERE user_id=_user_id AND club_id=_club_id AND role='admin')
    OR EXISTS (
      SELECT 1 FROM public.club_member_permissions cmp
      JOIN public.club_members cm ON cm.id = cmp.club_member_id
      LEFT JOIN public.club_permission_roles r ON r.id = cmp.permission_role_id AND r.club_id = cm.club_id
      WHERE cm.user_id=_user_id AND cm.club_id=_club_id
        AND (cmp.is_full_admin = true OR r.is_full_admin = true)
    );
$$;