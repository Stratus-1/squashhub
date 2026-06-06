DROP POLICY IF EXISTS "Signed-in users can view Bells champ entries" ON public.club_champs_entries;
CREATE POLICY "Signed-in users can view Bells champ entries"
ON public.club_champs_entries
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.club_champs c
    WHERE c.id = club_champs_entries.champ_id
      AND c.scoring_mode = 'time_capped_points'
  )
);