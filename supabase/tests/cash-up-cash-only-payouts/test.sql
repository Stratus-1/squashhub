INSERT INTO club_journal_entries VALUES ('11111111-1111-1111-1111-111111111111','cash',133,0,'2026-10-28T10:00Z',NULL);
INSERT INTO bar_tip_payouts VALUES
 ('11111111-1111-1111-1111-111111111111','salary',250,'2026-10-29T06:09Z'),
 ('11111111-1111-1111-1111-111111111111','salary',124,'2026-10-29T06:09Z'),
 ('11111111-1111-1111-1111-111111111111','salary',47,'2026-10-29T06:09Z');
INSERT INTO club_journal_entries VALUES ('11111111-1111-1111-1111-111111111111','bank_current',0,421,'2026-10-29T06:09Z',NULL);
DO $$ DECLARE s jsonb; BEGIN
 s:=_bar_cash_up_summary('11111111-1111-1111-1111-111111111111','2026-10-28T19:53Z','2026-10-29T19:36Z');
 IF (s->>'tip_payouts')::numeric<>0 OR (s->>'cash_movements')::numeric<>0 OR (s->>'expected_cash')::numeric<>133 THEN
 RAISE EXCEPTION 'R421 EFT must not appear as cash or change R133 till: %',s; END IF;
END $$;
INSERT INTO bar_tip_payouts VALUES ('11111111-1111-1111-1111-111111111111','cash',20,'2026-10-29T12:00Z');
INSERT INTO club_journal_entries VALUES ('11111111-1111-1111-1111-111111111111','cash',0,20,'2026-10-29T12:00Z',NULL);
INSERT INTO bar_tip_payouts VALUES ('22222222-2222-2222-2222-222222222222','cash',90,'2026-10-29T12:00Z');
INSERT INTO bar_tip_payouts VALUES ('11111111-1111-1111-1111-111111111111','cash',30,'2026-10-30T12:00Z');
DO $$ DECLARE s jsonb; BEGIN
 s:=_bar_cash_up_summary('11111111-1111-1111-1111-111111111111','2026-10-28T19:53Z','2026-10-29T19:36Z');
 IF (s->>'tip_payouts')::numeric<>20 OR (s->>'cash_movements')::numeric<>0 OR (s->>'expected_cash')::numeric<>113 THEN
 RAISE EXCEPTION 'Only this club/period cash payout reduces till once: %',s; END IF;
END $$;