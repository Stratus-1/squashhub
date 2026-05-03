DROP POLICY IF EXISTS "Users can create matches they participate in" ON public.matches;

CREATE POLICY "Users can create matches as participant or marker"
ON public.matches
FOR INSERT
TO authenticated
WITH CHECK (
  ((club_id IS NULL) OR is_club_member(auth.uid(), club_id))
  AND (
    auth.uid() = player_a
    OR auth.uid() = player_b
    OR auth.uid() = submitted_by
    OR (submitted_by_member_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM club_members cm
      WHERE cm.id = submitted_by_member_id AND cm.user_id = auth.uid()
    ))
  )
);