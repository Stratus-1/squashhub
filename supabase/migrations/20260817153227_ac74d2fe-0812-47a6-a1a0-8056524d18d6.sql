DROP POLICY IF EXISTS "Club admins can insert members" ON public.club_members;

CREATE POLICY "Club admins can insert members"
  ON public.club_members FOR INSERT TO authenticated
  WITH CHECK (
    public.is_club_admin(auth.uid(), club_id)
    OR (
      auth.uid() = user_id
      AND role <> 'admin'::public.club_member_role
    )
  );

DROP POLICY IF EXISTS "Club admins can update members" ON public.club_members;

CREATE POLICY "Club admins can update members"
  ON public.club_members FOR UPDATE TO authenticated
  USING (public.is_club_admin(auth.uid(), club_id) OR (auth.uid() = user_id))
  WITH CHECK (
    public.is_club_admin(auth.uid(), club_id)
    OR (
      auth.uid() = user_id
      AND role <> 'admin'::public.club_member_role
    )
  );

CREATE OR REPLACE FUNCTION public.club_members_prevent_self_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'admin'::public.club_member_role
     AND NOT public.is_club_admin(auth.uid(), NEW.club_id)
  THEN
    RAISE EXCEPTION 'Only club admins can assign the admin role';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS club_members_prevent_self_admin_trigger ON public.club_members;
CREATE TRIGGER club_members_prevent_self_admin_trigger
  BEFORE INSERT OR UPDATE OF role ON public.club_members
  FOR EACH ROW
  EXECUTE FUNCTION public.club_members_prevent_self_admin();

COMMENT ON FUNCTION public.club_members_prevent_self_admin() IS 'Prevents non-admin users from elevating their own club_members.role to admin.';