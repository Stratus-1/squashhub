DROP POLICY IF EXISTS "Applicants can view paid active fee categories" ON public.member_fee_categories;
CREATE POLICY "Signed-in joiners can view paid active fee categories"
ON public.member_fee_categories FOR SELECT TO authenticated
USING (active = true AND annual_fee > 0);