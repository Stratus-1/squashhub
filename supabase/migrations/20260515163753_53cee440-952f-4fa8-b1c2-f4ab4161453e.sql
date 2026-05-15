CREATE OR REPLACE FUNCTION public.is_club_admin(_user_id uuid, _club_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM public.club_members
    WHERE user_id = _user_id AND club_id = _club_id AND role IN ('captain', 'admin')
  )
$$;

CREATE OR REPLACE FUNCTION public.is_club_admin_or_permitted(_user_id uuid, _club_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1 FROM club_members cm
    WHERE cm.club_id = _club_id
      AND cm.user_id = _user_id
      AND cm.role IN ('captain', 'admin')
  )
  OR EXISTS (
    SELECT 1
    FROM club_members cm
    JOIN club_member_permissions cmp ON cmp.club_member_id = cm.id
    LEFT JOIN club_permission_roles cpr ON cpr.id = cmp.permission_role_id
    WHERE cm.club_id = _club_id
      AND cm.user_id = _user_id
      AND (
        _permission = ANY(cmp.custom_permissions)
        OR _permission = ANY(cpr.permissions)
      )
  )
$$;