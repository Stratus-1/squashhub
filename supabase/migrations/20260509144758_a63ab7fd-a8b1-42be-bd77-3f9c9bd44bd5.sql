
-- Helper: is the user a platform super-admin or moderator?
CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin','moderator')
  )
$$;

-- club_permission_roles: super-admin access
DROP POLICY IF EXISTS "Platform admins can view permission roles" ON public.club_permission_roles;
CREATE POLICY "Platform admins can view permission roles"
  ON public.club_permission_roles FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Platform admins can manage permission roles" ON public.club_permission_roles;
CREATE POLICY "Platform admins can manage permission roles"
  ON public.club_permission_roles FOR ALL
  TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- club_member_permissions: super-admin access
DROP POLICY IF EXISTS "Platform admins can view member permissions" ON public.club_member_permissions;
CREATE POLICY "Platform admins can view member permissions"
  ON public.club_member_permissions FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Platform admins can manage member permissions" ON public.club_member_permissions;
CREATE POLICY "Platform admins can manage member permissions"
  ON public.club_member_permissions FOR ALL
  TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));
