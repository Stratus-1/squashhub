CREATE POLICY "Users can delete own notifications"
ON public.notifications
FOR DELETE
USING (
  (auth.uid() = user_id)
  OR (
    club_member_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM club_members cm
      WHERE cm.id = notifications.club_member_id AND cm.user_id = auth.uid()
    )
  )
  OR (
    club_member_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM club_members cm
      JOIN club_members cm2 ON cm2.club_id = cm.club_id AND cm2.email = cm.email
      WHERE cm.id = notifications.club_member_id AND cm2.user_id = auth.uid()
    )
  )
);