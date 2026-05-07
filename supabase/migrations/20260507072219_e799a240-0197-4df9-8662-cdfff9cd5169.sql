DROP POLICY IF EXISTS "Permitted members manage rounds" ON public.league_rounds;
CREATE POLICY "Permitted members manage rounds" ON public.league_rounds
  FOR ALL TO authenticated
  USING (public.is_club_admin_or_permitted(auth.uid(), club_id, 'leagues') OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.is_club_admin_or_permitted(auth.uid(), club_id, 'leagues') OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "Members can view their club rounds" ON public.league_rounds;
CREATE POLICY "Members can view their club rounds" ON public.league_rounds
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM club_members cm WHERE cm.user_id = auth.uid() AND cm.club_id = league_rounds.club_id)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );