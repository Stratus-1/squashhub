CREATE POLICY "Association admins manage own ranking settings" ON public.association_ranking_settings
  FOR ALL TO authenticated
  USING (public.is_association_admin(auth.uid(), association_id))
  WITH CHECK (public.is_association_admin(auth.uid(), association_id));