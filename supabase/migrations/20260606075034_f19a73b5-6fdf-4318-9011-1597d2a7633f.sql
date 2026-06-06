DROP POLICY IF EXISTS "Signed-in users can view Bells champs" ON public.club_champs;
CREATE POLICY "Signed-in users can view Bells champs"
ON public.club_champs
FOR SELECT
TO authenticated
USING (scoring_mode = 'time_capped_points');

DROP POLICY IF EXISTS "Signed-in users can view Bells champ matches" ON public.club_champs_matches;
CREATE POLICY "Signed-in users can view Bells champ matches"
ON public.club_champs_matches
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.club_champs c
    WHERE c.id = club_champs_matches.champ_id
      AND c.scoring_mode = 'time_capped_points'
  )
);

DROP POLICY IF EXISTS "Signed-in users can view Bells participants" ON public.club_members;
CREATE POLICY "Signed-in users can view Bells participants"
ON public.club_members
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.club_champs_matches m
    JOIN public.club_champs c ON c.id = m.champ_id
    WHERE c.scoring_mode = 'time_capped_points'
      AND club_members.id IN (
        m.player_a_member_id,
        m.player_b_member_id,
        m.partner_a_member_id,
        m.partner_b_member_id,
        m.bye_member_id
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.club_champs_entries e
    JOIN public.club_champs c ON c.id = e.champ_id
    WHERE c.scoring_mode = 'time_capped_points'
      AND club_members.id IN (e.club_member_id, e.partner_member_id)
  )
);