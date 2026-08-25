GRANT INSERT ON public.access_events TO authenticated;

CREATE POLICY "Members log own access events"
ON public.access_events
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.club_id = access_events.club_id
      AND cm.user_id = auth.uid()
  )
  AND (
    access_events.club_member_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.club_members cm2
      WHERE cm2.id = access_events.club_member_id
        AND cm2.club_id = access_events.club_id
        AND cm2.user_id = auth.uid()
    )
  )
);