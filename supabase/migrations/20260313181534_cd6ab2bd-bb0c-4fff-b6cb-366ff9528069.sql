-- Allow any authenticated user to view fee categories (needed during onboarding before membership is created)
DROP POLICY IF EXISTS "Club members can view fee categories" ON public.member_fee_categories;

CREATE POLICY "Authenticated users can view fee categories"
ON public.member_fee_categories
FOR SELECT
TO authenticated
USING (true);