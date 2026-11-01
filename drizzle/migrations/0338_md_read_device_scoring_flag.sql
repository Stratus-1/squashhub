CREATE POLICY "Match day link reads offline scoring flag" ON public.club_beta_features
FOR SELECT TO anon
USING (feature = 'tournament_device_scoring' AND public.md_hdr_champ_open() AND club_id = public.md_hdr_club());