CREATE OR REPLACE FUNCTION public.current_verified_email()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lower(u.email)
  FROM auth.users u
  WHERE u.id = auth.uid()
    AND u.email IS NOT NULL
    AND u.email_confirmed_at IS NOT NULL
$$;

REVOKE ALL ON FUNCTION public.current_verified_email() FROM public;
GRANT EXECUTE ON FUNCTION public.current_verified_email() TO authenticated, service_role;

DROP POLICY IF EXISTS "Users can claim unlinked non-admin member by email" ON public.club_members;

CREATE POLICY "Users can claim unlinked non-admin member by verified email"
ON public.club_members
FOR UPDATE
TO authenticated
USING (
  user_id IS NULL
  AND role <> 'admin'::public.club_member_role
  AND email IS NOT NULL
  AND public.current_verified_email() IS NOT NULL
  AND lower(email) = public.current_verified_email()
)
WITH CHECK (
  user_id = auth.uid()
  AND role <> 'admin'::public.club_member_role
  AND email IS NOT NULL
  AND public.current_verified_email() IS NOT NULL
  AND lower(email) = public.current_verified_email()
);