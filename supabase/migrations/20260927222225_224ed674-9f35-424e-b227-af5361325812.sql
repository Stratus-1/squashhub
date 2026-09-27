DO $$
DECLARE
  v_ref uuid := gen_random_uuid();
BEGIN
  INSERT INTO club_journal_entries (club_id, journal_ref, account, club_member_id, debit, credit, description)
  VALUES ('061e6dd9-0ec2-4427-a939-3f18ad0884c8', v_ref, 'opening_balance_equity'::gl_account, NULL, 348, 0, 'Opening balance – Roedolf Van Wyk');
  INSERT INTO club_journal_entries (club_id, journal_ref, account, club_member_id, debit, credit, description)
  VALUES ('061e6dd9-0ec2-4427-a939-3f18ad0884c8', v_ref, 'debtors'::gl_account, '52bc0e2b-700b-486c-a666-6205acc7c6e2', 0, 348, 'Opening balance – member credit brought forward');
END $$;