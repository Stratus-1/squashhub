-- Allow members to read their own member transactions by club_member ownership
-- This supports family/shared-login accounts where club_member_id is the primary identity.

DROP POLICY IF EXISTS "Users can view own credit transactions" ON public.member_credit_transactions;

CREATE POLICY "Users can view own credit transactions"
ON public.member_credit_transactions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.club_members cm
    WHERE cm.id = member_credit_transactions.club_member_id
      AND cm.user_id = auth.uid()
      AND cm.club_id = member_credit_transactions.club_id
  )
  OR is_club_admin(auth.uid(), club_id)
  OR has_role(auth.uid(), 'admin'::public.app_role)
);

DROP POLICY IF EXISTS "Users can insert own credit transactions" ON public.member_credit_transactions;

CREATE POLICY "Users can insert own credit transactions"
ON public.member_credit_transactions
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.club_members cm
    WHERE cm.id = member_credit_transactions.club_member_id
      AND cm.user_id = auth.uid()
      AND cm.club_id = member_credit_transactions.club_id
  )
);