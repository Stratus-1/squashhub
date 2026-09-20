-- Family payers may see and settle the fees they are recorded as paying for.
CREATE POLICY "Payers can view fees they are billed for"
ON public.club_member_fee_payments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.id = club_member_fee_payments.paid_by_member_id
      AND cm.user_id = auth.uid()
  )
);

CREATE POLICY "Payers can settle fees they are billed for"
ON public.club_member_fee_payments
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.id = club_member_fee_payments.paid_by_member_id
      AND cm.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.id = club_member_fee_payments.paid_by_member_id
      AND cm.user_id = auth.uid()
  )
);