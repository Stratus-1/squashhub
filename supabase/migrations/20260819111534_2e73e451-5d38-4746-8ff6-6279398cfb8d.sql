CREATE POLICY "Tournament officials can view champs matches"
ON public.club_champs_matches FOR SELECT TO authenticated
USING (public.can_view_tournament(auth.uid(), champ_id));

CREATE POLICY "Tournament officials can score champs matches"
ON public.club_champs_matches FOR UPDATE TO authenticated
USING (public.can_manage_tournament(auth.uid(), champ_id))
WITH CHECK (public.can_manage_tournament(auth.uid(), champ_id));