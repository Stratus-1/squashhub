INSERT INTO clubs(id) VALUES('11111111-1111-1111-1111-111111111111'),('22222222-2222-2222-2222-222222222222');
INSERT INTO club_members(id,club_id,name) VALUES
 ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','Fictional Riverside member'),
 ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','22222222-2222-2222-2222-222222222222','Fictional other club');
INSERT INTO bar_counter_sessions(token,club_id,expires_at,revoked_at) VALUES
 ('cccccccc-cccc-cccc-cccc-cccccccccccc','11111111-1111-1111-1111-111111111111',now()+interval '1 day',NULL),
 ('dddddddd-dddd-dddd-dddd-dddddddddddd','11111111-1111-1111-1111-111111111111',now()-interval '1 day',NULL),
 ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','11111111-1111-1111-1111-111111111111',now()+interval '1 day',now());
SET ROLE anon;
DO $$ DECLARE r jsonb; BEGIN
 IF auth.uid() IS NOT NULL OR current_user <> 'anon' THEN RAISE EXCEPTION 'Must run signed out'; END IF;
 r:=public.bar_counter_topup_member('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',100,'card','ffffffff-ffff-ffff-ffff-ffffffffffff','cccccccc-cccc-cccc-cccc-cccccccccccc');
 IF r->>'ok' <> 'true' OR (r->>'amount')::numeric <> 100 THEN RAISE EXCEPTION 'PIN-only R100 card top-up failed'; END IF;
 r:=public.bar_counter_topup_member('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',100,'card','ffffffff-ffff-ffff-ffff-ffffffffffff','cccccccc-cccc-cccc-cccc-cccccccccccc');
 IF r->>'already' <> 'true' THEN RAISE EXCEPTION 'Retry must return existing transaction'; END IF;
END $$;
-- Specific error checks cannot pass merely because anon lacks execute permission.
DO $$ DECLARE tok uuid; BEGIN
 FOREACH tok IN ARRAY ARRAY[NULL::uuid,'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid,'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid,'99999999-9999-9999-9999-999999999999'::uuid] LOOP
  BEGIN
   PERFORM public.bar_counter_topup_member('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',100,'card',gen_random_uuid(),tok);
   RAISE EXCEPTION 'Invalid PIN session accepted';
  EXCEPTION WHEN OTHERS THEN
   IF SQLERRM NOT IN ('This counter device needs to be unlocked again','You do not have bar permission for this club') THEN RAISE; END IF;
  END;
 END LOOP;
 BEGIN
  PERFORM public.bar_counter_topup_member('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',100,'cash',gen_random_uuid(),'cccccccc-cccc-cccc-cccc-cccccccccccc');
  RAISE EXCEPTION 'Cash accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'Bar top-ups are card only — cash is not accepted' THEN RAISE; END IF; END;
 BEGIN
  PERFORM public.bar_counter_topup_member('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',100,'card',gen_random_uuid(),'cccccccc-cccc-cccc-cccc-cccccccccccc');
  RAISE EXCEPTION 'Foreign club accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM <> 'Member not found at this club' THEN RAISE; END IF; END;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF (SELECT count(*) FROM member_credit_transactions) <> 1 THEN RAISE EXCEPTION 'Retry or rejected request wrote credits'; END IF;
 IF (SELECT count(*) FROM club_journal_entries) <> 2 THEN RAISE EXCEPTION 'Expected one balanced journal'; END IF;
 IF (SELECT sum(debit) FROM club_journal_entries WHERE account='bank_current') <> 100 THEN RAISE EXCEPTION 'Bank must increase R100'; END IF;
 IF (SELECT sum(credit) FROM club_journal_entries WHERE account='debtors') <> 100 THEN RAISE EXCEPTION 'Member debt must decrease R100'; END IF;
 IF (SELECT sum(debit-credit) FROM club_journal_entries) <> 0 THEN RAISE EXCEPTION 'Journal unbalanced'; END IF;
END $$;