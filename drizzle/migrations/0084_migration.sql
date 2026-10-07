DROP POLICY IF EXISTS "Signed-in users read recurring settings" ON public.club_recurring_settings;
CREATE POLICY "Club members and admins read recurring settings" ON public.club_recurring_settings
FOR SELECT TO authenticated
USING (public.is_club_member(auth.uid(), club_id) OR public.is_club_admin_or_permitted(auth.uid(), club_id, 'finance'::text));