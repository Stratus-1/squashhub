
-- Create a helper function that checks both traditional admin role AND granular permissions
CREATE OR REPLACE FUNCTION public.is_club_admin_or_permitted(_user_id uuid, _club_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
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

-- Update league_associations policies to use the new function
DROP POLICY "Club admins can manage associations" ON public.league_associations;
CREATE POLICY "Permitted members can insert associations"
ON public.league_associations FOR INSERT
TO authenticated
WITH CHECK (is_club_admin_or_permitted(auth.uid(), club_id, 'leagues'));

DROP POLICY "Club admins can update associations" ON public.league_associations;
CREATE POLICY "Permitted members can update associations"
ON public.league_associations FOR UPDATE
TO authenticated
USING (is_club_admin_or_permitted(auth.uid(), club_id, 'leagues'));

DROP POLICY "Club admins can delete associations" ON public.league_associations;
CREATE POLICY "Permitted members can delete associations"
ON public.league_associations FOR DELETE
TO authenticated
USING (is_club_admin_or_permitted(auth.uid(), club_id, 'leagues'));
