DROP POLICY IF EXISTS "Club members can view event instances" ON public.club_event_instances;
CREATE POLICY "Members creators and admins can view event instances"
ON public.club_event_instances FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.club_events ce
  WHERE ce.id = club_event_instances.event_id
    AND (
      public.is_club_member(auth.uid(), ce.club_id)
      OR auth.uid() = ce.created_by
      OR public.is_club_admin(auth.uid(), ce.club_id)
      OR public.is_platform_admin(auth.uid())
    )
));