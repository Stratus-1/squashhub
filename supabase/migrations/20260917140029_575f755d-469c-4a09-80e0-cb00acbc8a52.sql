CREATE POLICY "Club members and entrants view tournament registrations"
ON public.club_champs_registrations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tournaments t
    WHERE t.id = club_champs_registrations.champ_id
      AND (
        public.is_club_member(auth.uid(), t.club_id)
        OR public.can_view_tournament(auth.uid(), t.id)
      )
  )
);