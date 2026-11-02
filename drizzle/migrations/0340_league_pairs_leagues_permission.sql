CREATE POLICY "Leagues staff can insert pairs"
ON public.league_team_pairs FOR INSERT TO authenticated
WITH CHECK (public.has_club_permission(auth.uid(), club_id, 'leagues'));

CREATE POLICY "Leagues staff can update pairs"
ON public.league_team_pairs FOR UPDATE TO authenticated
USING (public.has_club_permission(auth.uid(), club_id, 'leagues'))
WITH CHECK (public.has_club_permission(auth.uid(), club_id, 'leagues'));

CREATE POLICY "Leagues staff can delete pairs"
ON public.league_team_pairs FOR DELETE TO authenticated
USING (public.has_club_permission(auth.uid(), club_id, 'leagues'));
