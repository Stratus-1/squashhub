CREATE POLICY "Tournament participants can score their own match"
ON public.club_champs_matches
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.club_champs c
    WHERE c.id = club_champs_matches.champ_id
      AND (
        public.is_member_owner(club_champs_matches.player_a_member_id)
        OR public.is_member_owner(club_champs_matches.player_b_member_id)
        OR public.is_member_owner(club_champs_matches.partner_a_member_id)
        OR public.is_member_owner(club_champs_matches.partner_b_member_id)
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.club_champs c
    WHERE c.id = club_champs_matches.champ_id
      AND (
        public.is_member_owner(club_champs_matches.player_a_member_id)
        OR public.is_member_owner(club_champs_matches.player_b_member_id)
        OR public.is_member_owner(club_champs_matches.partner_a_member_id)
        OR public.is_member_owner(club_champs_matches.partner_b_member_id)
      )
      AND club_champs_matches.champ_id = c.id
      AND club_champs_matches.group_number IS NOT DISTINCT FROM club_champs_matches.group_number
      AND club_champs_matches.round_number IS NOT DISTINCT FROM club_champs_matches.round_number
      AND club_champs_matches.player_a_member_id IS NOT DISTINCT FROM club_champs_matches.player_a_member_id
      AND club_champs_matches.player_b_member_id IS NOT DISTINCT FROM club_champs_matches.player_b_member_id
      AND club_champs_matches.partner_a_member_id IS NOT DISTINCT FROM club_champs_matches.partner_a_member_id
      AND club_champs_matches.partner_b_member_id IS NOT DISTINCT FROM club_champs_matches.partner_b_member_id
      AND club_champs_matches.scheduled_date IS NOT DISTINCT FROM club_champs_matches.scheduled_date
      AND club_champs_matches.scheduled_time IS NOT DISTINCT FROM club_champs_matches.scheduled_time
      AND club_champs_matches.court_id IS NOT DISTINCT FROM club_champs_matches.court_id
      AND club_champs_matches.status IN ('scheduled', 'in_progress', 'completed')
  )
);