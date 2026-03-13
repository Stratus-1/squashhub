
-- Allow members to view their own fee payment records
CREATE POLICY "Members can view own fee payments"
ON public.club_member_fee_payments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.id = club_member_fee_payments.club_member_id
      AND cm.user_id = auth.uid()
  )
);

-- Allow members to update their own fee payments (for card payments marking as paid)
CREATE POLICY "Members can update own fee payments"
ON public.club_member_fee_payments
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.id = club_member_fee_payments.club_member_id
      AND cm.user_id = auth.uid()
  )
);
