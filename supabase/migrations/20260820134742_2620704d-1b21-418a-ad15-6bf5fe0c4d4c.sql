DROP POLICY IF EXISTS "Users can claim unlinked member by email" ON public.club_members;

CREATE POLICY "Users can claim unlinked non-admin member by email"
ON public.club_members
FOR UPDATE
TO authenticated
USING (
  user_id IS NULL
  AND role <> 'admin'::public.club_member_role
  AND email IS NOT NULL
  AND lower(email) = lower(COALESCE((SELECT p.email FROM public.profiles p WHERE p.id = auth.uid()), ''))
)
WITH CHECK (
  user_id = auth.uid()
  AND role <> 'admin'::public.club_member_role
  AND lower(COALESCE(email, '')) = lower(COALESCE((SELECT p.email FROM public.profiles p WHERE p.id = auth.uid()), ''))
);