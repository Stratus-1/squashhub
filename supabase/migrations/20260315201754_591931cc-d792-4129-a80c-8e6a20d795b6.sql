
-- Allow members to insert journal entries for their own payments
CREATE POLICY "Members can insert own payment journal entries"
ON public.club_journal_entries
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM club_members cm
    WHERE cm.id = club_journal_entries.club_member_id
      AND cm.user_id = auth.uid()
      AND cm.club_id = club_journal_entries.club_id
  )
);

-- Allow members to read their own journal entries (for statement)
CREATE POLICY "Members can read own journal entries"
ON public.club_journal_entries
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM club_members cm
    WHERE cm.id = club_journal_entries.club_member_id
      AND cm.user_id = auth.uid()
  )
);
