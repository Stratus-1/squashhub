
-- Allow club admins to view member credit transactions for members in their club
CREATE POLICY "Club admins can view member credit transactions"
ON public.member_credit_transactions FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.club_members cm_target
    JOIN public.club_members cm_admin ON cm_admin.club_id = cm_target.club_id
    WHERE cm_target.user_id = member_credit_transactions.user_id
      AND cm_admin.user_id = auth.uid()
      AND cm_admin.role IN ('captain', 'admin')
  )
);

-- Allow club admins to update (confirm/reject) member credit transactions
CREATE POLICY "Club admins can update member credit transactions"
ON public.member_credit_transactions FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.club_members cm_target
    JOIN public.club_members cm_admin ON cm_admin.club_id = cm_target.club_id
    WHERE cm_target.user_id = member_credit_transactions.user_id
      AND cm_admin.user_id = auth.uid()
      AND cm_admin.role IN ('captain', 'admin')
  )
);
