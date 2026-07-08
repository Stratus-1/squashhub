DELETE FROM club_journal_entries
WHERE club_member_id = (SELECT id FROM club_members WHERE club_member_number='GBSQ0006')
  AND created_at::date = '2026-07-08'
  AND description LIKE 'Fee paid:%'
  AND (debit = 1600 OR credit = 1600);