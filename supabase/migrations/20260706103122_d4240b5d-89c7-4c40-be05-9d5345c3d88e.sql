
-- Allow platform admins (super admins) to create bookings in any club
DROP POLICY IF EXISTS "Users can create bookings" ON public.bookings;
CREATE POLICY "Users can create bookings" ON public.bookings
FOR INSERT TO authenticated
WITH CHECK (
  (auth.uid() = user_id)
  AND (
    club_id IS NULL
    OR is_club_member(auth.uid(), club_id)
    OR is_club_admin(auth.uid(), club_id)
    OR is_platform_admin(auth.uid())
  )
);

DROP POLICY IF EXISTS "Club admins can create block bookings" ON public.bookings;
CREATE POLICY "Club admins can create block bookings" ON public.bookings
FOR INSERT TO authenticated
WITH CHECK (
  club_id IS NOT NULL
  AND (is_club_admin(auth.uid(), club_id) OR is_platform_admin(auth.uid()))
);

-- Allow platform admins on club_event child tables (courts / instances / rsvps)
DROP POLICY IF EXISTS "Insertable by event creator" ON public.club_event_courts;
CREATE POLICY "Insertable by event creator" ON public.club_event_courts
FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.club_events ce
  WHERE ce.id = club_event_courts.event_id
    AND (auth.uid() = ce.created_by OR is_club_admin(auth.uid(), ce.club_id) OR is_platform_admin(auth.uid()))
));

DROP POLICY IF EXISTS "Deletable by event creator" ON public.club_event_courts;
CREATE POLICY "Deletable by event creator" ON public.club_event_courts
FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.club_events ce
  WHERE ce.id = club_event_courts.event_id
    AND (auth.uid() = ce.created_by OR is_club_admin(auth.uid(), ce.club_id) OR is_platform_admin(auth.uid()))
));

DROP POLICY IF EXISTS "Creator or admin can insert event instances" ON public.club_event_instances;
CREATE POLICY "Creator or admin can insert event instances" ON public.club_event_instances
FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.club_events ce
  WHERE ce.id = club_event_instances.event_id
    AND (auth.uid() = ce.created_by OR is_club_admin(auth.uid(), ce.club_id) OR is_platform_admin(auth.uid()))
));

DROP POLICY IF EXISTS "Creator or admin can update event instances" ON public.club_event_instances;
CREATE POLICY "Creator or admin can update event instances" ON public.club_event_instances
FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.club_events ce
  WHERE ce.id = club_event_instances.event_id
    AND (auth.uid() = ce.created_by OR is_club_admin(auth.uid(), ce.club_id) OR is_platform_admin(auth.uid()))
));

DROP POLICY IF EXISTS "Creator or admin can delete event instances" ON public.club_event_instances;
CREATE POLICY "Creator or admin can delete event instances" ON public.club_event_instances
FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.club_events ce
  WHERE ce.id = club_event_instances.event_id
    AND (auth.uid() = ce.created_by OR is_club_admin(auth.uid(), ce.club_id) OR is_platform_admin(auth.uid()))
));

DROP POLICY IF EXISTS "Creator can insert event RSVPs" ON public.club_event_rsvps;
CREATE POLICY "Creator can insert event RSVPs" ON public.club_event_rsvps
FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.club_events ce
  WHERE ce.id = club_event_rsvps.event_id
    AND (auth.uid() = ce.created_by OR is_club_admin(auth.uid(), ce.club_id) OR is_platform_admin(auth.uid()))
));

DROP POLICY IF EXISTS "Creator can delete event RSVPs" ON public.club_event_rsvps;
CREATE POLICY "Creator can delete event RSVPs" ON public.club_event_rsvps
FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.club_events ce
  WHERE ce.id = club_event_rsvps.event_id
    AND (auth.uid() = ce.created_by OR is_club_admin(auth.uid(), ce.club_id) OR is_platform_admin(auth.uid()))
));

DROP POLICY IF EXISTS "Creator or admin can insert instance RSVPs" ON public.club_event_instance_rsvps;
CREATE POLICY "Creator or admin can insert instance RSVPs" ON public.club_event_instance_rsvps
FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.club_event_instances cei
  JOIN public.club_events ce ON ce.id = cei.event_id
  WHERE cei.id = club_event_instance_rsvps.instance_id
    AND (auth.uid() = ce.created_by OR is_club_admin(auth.uid(), ce.club_id) OR is_platform_admin(auth.uid()))
));
