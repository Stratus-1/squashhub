DROP POLICY IF EXISTS "Members or admins can create club events" ON public.club_events;
DROP POLICY IF EXISTS "Creator or admin can update club events" ON public.club_events;
DROP POLICY IF EXISTS "Creator or admin can delete club events" ON public.club_events;
DROP POLICY IF EXISTS "Club members can view club events" ON public.club_events;

CREATE POLICY "View club events" ON public.club_events
FOR SELECT TO authenticated
USING (is_club_member(auth.uid(), club_id) OR is_platform_admin(auth.uid()));

CREATE POLICY "Create club events" ON public.club_events
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = created_by AND (is_club_member(auth.uid(), club_id) OR is_club_admin(auth.uid(), club_id) OR is_platform_admin(auth.uid())));

CREATE POLICY "Update club events" ON public.club_events
FOR UPDATE TO authenticated
USING (auth.uid() = created_by OR is_club_admin(auth.uid(), club_id) OR is_platform_admin(auth.uid()));

CREATE POLICY "Delete club events" ON public.club_events
FOR DELETE TO authenticated
USING (auth.uid() = created_by OR is_club_admin(auth.uid(), club_id) OR is_platform_admin(auth.uid()));