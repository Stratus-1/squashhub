-- Allow authenticated users to claim/update an unlinked club_members row
-- when the row's email matches their auth email. This is required so the
-- onboarding wizard can save personal details onto pre-existing imported
-- member records and link user_id at the same time.

CREATE POLICY "Users can claim unlinked member by email"
ON public.club_members
FOR UPDATE
TO authenticated
USING (
  user_id IS NULL
  AND email IS NOT NULL
  AND lower(email) = lower(COALESCE((SELECT email FROM public.profiles WHERE id = auth.uid()), ''))
)
WITH CHECK (
  -- After update, the row must be linked to this user (or remain unlinked but matching email)
  user_id = auth.uid()
  OR (user_id IS NULL AND lower(COALESCE(email, '')) = lower(COALESCE((SELECT email FROM public.profiles WHERE id = auth.uid()), '')))
);