-- Harden championship registration visibility: members may only read their own registration or one where they are the invited partner.
-- Tournament admins continue to manage all registrations via the separate admin policy.

DROP POLICY IF EXISTS "Members view registrations in their club" ON public.club_champs_registrations;

CREATE POLICY "Members view own or partner registrations"
  ON public.club_champs_registrations
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.id = club_champs_registrations.club_member_id
    )
    OR EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.id = club_champs_registrations.partner_member_id
    )
  );