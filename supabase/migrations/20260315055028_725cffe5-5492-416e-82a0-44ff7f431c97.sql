-- Allow anonymous users to view fee categories (for public club landing page)
CREATE POLICY "Public can view fee categories"
  ON public.member_fee_categories
  FOR SELECT
  TO anon
  USING (true);