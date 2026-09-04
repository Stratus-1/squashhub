-- 1) Strict admin check for club credentials
CREATE OR REPLACE FUNCTION public.is_club_secrets_admin(_user_id uuid, _club_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.club_members
      WHERE user_id = _user_id AND club_id = _club_id AND role = 'admin'
    )
    OR EXISTS (
      SELECT 1
      FROM public.club_member_permissions cmp
      JOIN public.club_members cm ON cm.id = cmp.club_member_id
      WHERE cm.user_id = _user_id
        AND cm.club_id = _club_id
        AND cmp.is_full_admin = true
    );
$$;
REVOKE ALL ON FUNCTION public.is_club_secrets_admin(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_club_secrets_admin(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Club admins can select secrets" ON public.club_secrets;
DROP POLICY IF EXISTS "Club admins can insert secrets" ON public.club_secrets;
DROP POLICY IF EXISTS "Club admins can update secrets" ON public.club_secrets;
DROP POLICY IF EXISTS "Club admins can delete secrets" ON public.club_secrets;

CREATE POLICY "Strict club admins can select secrets" ON public.club_secrets
  FOR SELECT TO authenticated USING (public.is_club_secrets_admin(auth.uid(), club_id));
CREATE POLICY "Strict club admins can insert secrets" ON public.club_secrets
  FOR INSERT TO authenticated WITH CHECK (public.is_club_secrets_admin(auth.uid(), club_id));
CREATE POLICY "Strict club admins can update secrets" ON public.club_secrets
  FOR UPDATE TO authenticated USING (public.is_club_secrets_admin(auth.uid(), club_id))
  WITH CHECK (public.is_club_secrets_admin(auth.uid(), club_id));
CREATE POLICY "Strict club admins can delete secrets" ON public.club_secrets
  FOR DELETE TO authenticated USING (public.is_club_secrets_admin(auth.uid(), club_id));

-- 2) Championship view respects the querying user's permissions
ALTER VIEW public.club_champs SET (security_invoker = on);

-- 3) Visitor contact details: hide phone/email from ordinary members via column grants
REVOKE SELECT ON public.club_visitors FROM authenticated;
GRANT SELECT (id, club_id, first_name, last_name, home_club_name, member_number, category, created_at)
  ON public.club_visitors TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.club_visitors TO authenticated;
GRANT ALL ON public.club_visitors TO service_role;

-- Admin/front-desk full read (includes phone + email)
CREATE OR REPLACE FUNCTION public.admin_list_club_visitors(_club_id uuid)
RETURNS TABLE(
  id uuid, club_id uuid, first_name text, last_name text, phone text, email text,
  home_club_name text, member_number text, category text, created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_club_admin(auth.uid(), _club_id)
          OR public.bar_staff_can_serve(auth.uid(), _club_id)) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  RETURN QUERY
  SELECT v.id, v.club_id, v.first_name, v.last_name, v.phone, v.email,
         v.home_club_name, v.member_number, v.category, v.created_at
  FROM public.club_visitors v
  WHERE v.club_id = _club_id
  ORDER BY v.created_at DESC;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_club_visitors(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_club_visitors(uuid) TO authenticated, service_role;