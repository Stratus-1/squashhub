
-- Update RLS policy on club_event_rsvps to allow updating RSVPs for email-linked members
DROP POLICY IF EXISTS "Members can update own RSVP" ON public.club_event_rsvps;

CREATE POLICY "Members can update own RSVP"
ON public.club_event_rsvps
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.id = club_event_rsvps.club_member_id
      AND (
        cm.user_id = auth.uid()
        OR (
          cm.email IS NOT NULL
          AND cm.email = (SELECT email FROM public.profiles WHERE id = auth.uid())
        )
      )
  )
);

-- Also update club_event_instance_rsvps policy for same pattern
DROP POLICY IF EXISTS "Members can update own instance RSVP" ON public.club_event_instance_rsvps;

CREATE POLICY "Members can update own instance RSVP"
ON public.club_event_instance_rsvps
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.id = club_event_instance_rsvps.club_member_id
      AND (
        cm.user_id = auth.uid()
        OR (
          cm.email IS NOT NULL
          AND cm.email = (SELECT email FROM public.profiles WHERE id = auth.uid())
        )
      )
  )
);
