DROP POLICY IF EXISTS "Org groupings are viewable by everyone" ON public.org_groupings;
REVOKE SELECT ON public.org_groupings FROM anon;
CREATE POLICY "Signed-in users can view org groupings"
  ON public.org_groupings FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);