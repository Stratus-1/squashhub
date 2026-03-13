
-- Allow members to insert their own fee payment records (needed during onboarding)
CREATE POLICY "Members can insert own fee payments"
ON public.club_member_fee_payments
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM club_members cm
    WHERE cm.id = club_member_fee_payments.club_member_id
      AND cm.user_id = auth.uid()
  )
);
