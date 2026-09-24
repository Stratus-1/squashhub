DROP POLICY IF EXISTS "Signed-in users read beta flags" ON public.club_beta_features;
CREATE POLICY "Club members read own club beta flags" ON public.club_beta_features
FOR SELECT TO authenticated
USING (public.is_club_member(auth.uid(), club_id) OR public.is_platform_admin(auth.uid()));