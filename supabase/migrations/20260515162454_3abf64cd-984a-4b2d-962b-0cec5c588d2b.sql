
CREATE POLICY "Super admins manage club secrets"
ON public.club_secrets FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
