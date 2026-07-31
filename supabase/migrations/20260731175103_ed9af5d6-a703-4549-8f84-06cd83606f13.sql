DROP POLICY IF EXISTS "Viewable by club members" ON public.club_event_courts;
CREATE POLICY "Members creators and admins can view event courts"
ON public.club_event_courts
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.club_events ce
  WHERE ce.id = club_event_courts.event_id
    AND (
      public.is_club_member(auth.uid(), ce.club_id)
      OR auth.uid() = ce.created_by
      OR public.is_club_admin(auth.uid(), ce.club_id)
      OR public.is_platform_admin(auth.uid())
    )
));