CREATE POLICY "Club admins see AI activity in their club" ON public.ai_assist_interactions
FOR SELECT TO authenticated USING (club_id IS NOT NULL AND public.is_club_admin(auth.uid(), club_id));