CREATE POLICY "Leagues staff can insert registrations" ON public.member_league_registrations FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.club_members cm WHERE cm.id = member_league_registrations.club_member_id AND public.has_club_permission(auth.uid(), cm.club_id, 'leagues')));
CREATE POLICY "Leagues staff can update registrations" ON public.member_league_registrations FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.club_members cm WHERE cm.id = member_league_registrations.club_member_id AND public.has_club_permission(auth.uid(), cm.club_id, 'leagues')));
CREATE POLICY "Leagues staff can delete registrations" ON public.member_league_registrations FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.club_members cm WHERE cm.id = member_league_registrations.club_member_id AND public.has_club_permission(auth.uid(), cm.club_id, 'leagues')));