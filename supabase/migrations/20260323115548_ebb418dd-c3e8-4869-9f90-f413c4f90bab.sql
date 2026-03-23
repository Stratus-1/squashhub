CREATE POLICY "Platform admins can view all club members"
  ON public.club_members
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));