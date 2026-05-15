
CREATE POLICY "Super admins manage journal entries"
ON public.club_journal_entries FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));
