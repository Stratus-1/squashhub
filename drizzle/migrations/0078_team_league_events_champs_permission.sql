CREATE POLICY "Tournament admins manage team leagues" ON public.team_league_events
FOR ALL TO authenticated
USING (public.has_club_permission(auth.uid(), club_id, 'champs'))
WITH CHECK (public.has_club_permission(auth.uid(), club_id, 'champs'));