DROP POLICY IF EXISTS "Club members and entrants view tournament registrations"
ON public.club_champs_registrations;

CREATE POLICY "Host club members view tournament registrations"
ON public.club_champs_registrations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.tournaments t
    WHERE t.id = club_champs_registrations.champ_id
      AND (
        public.is_club_member(auth.uid(), t.club_id)
        OR public.can_manage_tournament(auth.uid(), t.id)
      )
  )
);

DROP POLICY IF EXISTS "Club members and entrants can view entries"
ON public.club_champs_entries;

CREATE POLICY "Host club members and entrants view entries"
ON public.club_champs_entries
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.tournaments t
    WHERE t.id = club_champs_entries.champ_id
      AND (
        public.is_club_member(auth.uid(), t.club_id)
        OR public.can_manage_tournament(auth.uid(), t.id)
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.club_members cm
    WHERE cm.user_id = auth.uid()
      AND cm.id IN (
        club_champs_entries.club_member_id,
        club_champs_entries.partner_member_id
      )
  )
);

REVOKE ALL ON FUNCTION public.can_view_tournament_roster(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
DROP FUNCTION public.can_view_tournament_roster(uuid, uuid);