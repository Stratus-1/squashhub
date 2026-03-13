
-- Allow club admins to view fee_payments for members of their club
CREATE POLICY "Club admins can view member fee payments"
ON public.fee_payments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.club_members cm_target
    JOIN public.club_members cm_admin ON cm_admin.club_id = cm_target.club_id
    WHERE cm_target.user_id = fee_payments.user_id
      AND cm_admin.user_id = auth.uid()
      AND cm_admin.role IN ('captain', 'admin')
  )
);

-- Allow club admins to update fee_payments for members of their club
CREATE POLICY "Club admins can update member fee payments"
ON public.fee_payments
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.club_members cm_target
    JOIN public.club_members cm_admin ON cm_admin.club_id = cm_target.club_id
    WHERE cm_target.user_id = fee_payments.user_id
      AND cm_admin.user_id = auth.uid()
      AND cm_admin.role IN ('captain', 'admin')
  )
);

-- Allow club admins to insert fee_payments for members of their club
CREATE POLICY "Club admins can insert member fee payments"
ON public.fee_payments
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.club_members cm_target
    JOIN public.club_members cm_admin ON cm_admin.club_id = cm_target.club_id
    WHERE cm_target.user_id = fee_payments.user_id
      AND cm_admin.user_id = auth.uid()
      AND cm_admin.role IN ('captain', 'admin')
  )
);
