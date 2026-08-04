DROP POLICY IF EXISTS "Club members can view event RSVPs" ON public.club_event_rsvps;
CREATE POLICY "Club members can view event RSVPs" ON public.club_event_rsvps FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.club_events ce WHERE ce.id = club_event_rsvps.event_id AND (
    public.is_club_member(auth.uid(), ce.club_id) OR public.is_club_admin(auth.uid(), ce.club_id) OR public.is_platform_admin(auth.uid())
  ))
);

DROP POLICY IF EXISTS "Club members can view instance RSVPs" ON public.club_event_instance_rsvps;
CREATE POLICY "Club members can view instance RSVPs" ON public.club_event_instance_rsvps FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.club_event_instances ci
    JOIN public.club_events ce ON ce.id = ci.event_id
    WHERE ci.id = club_event_instance_rsvps.instance_id AND (
      public.is_club_member(auth.uid(), ce.club_id) OR public.is_club_admin(auth.uid(), ce.club_id) OR public.is_platform_admin(auth.uid())
    )
  )
);