
-- Permission slugs used across the app
-- finance, banking, members, visitors, events, courts, settings, leagues, champs, ladder, honesty_bar, fees

-- Predefined permission roles per club
CREATE TABLE public.club_permission_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  role_name text NOT NULL,
  permissions text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(club_id, role_name)
);

ALTER TABLE public.club_permission_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Club admins can manage permission roles"
  ON public.club_permission_roles FOR ALL
  TO authenticated
  USING (is_club_admin(auth.uid(), club_id))
  WITH CHECK (is_club_admin(auth.uid(), club_id));

CREATE POLICY "Club members can view permission roles"
  ON public.club_permission_roles FOR SELECT
  TO authenticated
  USING (is_club_member(auth.uid(), club_id));

-- Per-member permission assignments
CREATE TABLE public.club_member_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE UNIQUE,
  permission_role_id uuid REFERENCES public.club_permission_roles(id) ON DELETE SET NULL,
  custom_permissions text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.club_member_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Club admins can manage member permissions"
  ON public.club_member_permissions FOR ALL
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.id = club_member_permissions.club_member_id
      AND is_club_admin(auth.uid(), cm.club_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.id = club_member_permissions.club_member_id
      AND is_club_admin(auth.uid(), cm.club_id)
  ));

CREATE POLICY "Members can view own permissions"
  ON public.club_member_permissions FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.id = club_member_permissions.club_member_id
      AND cm.user_id = auth.uid()
  ));

-- Helper function: check if a member has a specific permission
CREATE OR REPLACE FUNCTION public.member_has_permission(_member_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- Captain and Chairman always have full access
    EXISTS (
      SELECT 1 FROM public.club_members cm
      JOIN public.clubs c ON c.id = cm.club_id
      WHERE cm.id = _member_id
        AND (cm.role IN ('captain', 'admin')
          OR c.chairman_member_id = cm.id
          OR c.secretary_member_id = cm.id
          OR c.club_captain_member_id = cm.id)
    )
    OR
    -- Check custom_permissions on member
    EXISTS (
      SELECT 1 FROM public.club_member_permissions cmp
      WHERE cmp.club_member_id = _member_id
        AND _permission = ANY(cmp.custom_permissions)
    )
    OR
    -- Check via assigned permission role
    EXISTS (
      SELECT 1 FROM public.club_member_permissions cmp
      JOIN public.club_permission_roles cpr ON cpr.id = cmp.permission_role_id
      WHERE cmp.club_member_id = _member_id
        AND _permission = ANY(cpr.permissions)
    )
$$;

-- Triggers for updated_at
CREATE TRIGGER update_club_permission_roles_updated_at
  BEFORE UPDATE ON public.club_permission_roles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_club_member_permissions_updated_at
  BEFORE UPDATE ON public.club_member_permissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
