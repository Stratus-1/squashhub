SELECT set_config('test.uid','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',false);
CREATE FUNCTION test_full(cash numeric DEFAULT 230,card numeric DEFAULT 575,amount numeric DEFAULT 40,settle boolean DEFAULT true,reason text DEFAULT 'Recount') RETURNS bar_cash_ups LANGUAGE sql AS $$
SELECT bar_cash_up_admin_correct_full(c.id,cash,card,'Corrected note',reason,
 jsonb_build_array(jsonb_build_object('id',md5(c.id::text||':22222222-2222-2222-2222-222222222222')::uuid,'expected_amount',coalesce((SELECT p.amount FROM bar_tip_payouts p WHERE p.id=md5(c.id::text||':22222222-2222-2222-2222-222222222222')::uuid),0),'amount',amount)),settle,
 jsonb_build_object('counted_cash',c.counted_cash,'card_counted',c.card_counted,'note',c.note,'written_off',c.written_off,'tip_payouts',coalesce((c.totals->>'tip_payouts')::numeric,0)))
 FROM bar_cash_ups c WHERE c.id='33333333-3333-3333-3333-333333333333' $$;
DO $$ BEGIN
 BEGIN PERFORM test_full(230,575,-56); RAISE EXCEPTION 'FAIL negative'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Tips paid out must be positive%' THEN RAISE; END IF; END;
 BEGIN PERFORM test_full(230,575,101); RAISE EXCEPTION 'FAIL exceeds balance'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Cash payout exceeds available tips for this shift' THEN RAISE; END IF; END;
 BEGIN PERFORM test_full(230,575,56,true,''); RAISE EXCEPTION 'FAIL reason'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'A reason is required' THEN RAISE; END IF; END;
 PERFORM set_config('test.uid','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',false);
 BEGIN PERFORM test_full(); RAISE EXCEPTION 'FAIL auth'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Bar or finance permission required' THEN RAISE; END IF; END;
 PERFORM set_config('test.uid','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',false);
END $$;
DO $$ DECLARE n bar_cash_ups; BEGIN
 n:=test_full(240,580,56);
 IF n.counted_cash<>240 OR n.card_counted<>580 OR n.expected_cash<>174 OR n.variance<>71 OR n.write_off_amount<>71 THEN RAISE EXCEPTION 'FAIL full settled cash/card/tips'; END IF;
 IF n.period_start<>'2026-10-21T00:00Z' OR n.period_end<>'2026-10-22T04:46Z' THEN RAISE EXCEPTION 'FAIL dates'; END IF;
 IF (SELECT sum(debit-credit) FROM club_journal_entries)<>0 THEN RAISE EXCEPTION 'FAIL balance'; END IF;
 IF (SELECT sum(debit-credit) FROM club_journal_entries WHERE journal_ref=n.id AND account='cash')<>66 OR (SELECT sum(debit-credit) FROM club_journal_entries WHERE journal_ref=n.id AND account='bank_current')<>5 THEN RAISE EXCEPTION 'FAIL separate cash/card'; END IF;
 IF NOT EXISTS(SELECT 1 FROM audit_events WHERE action='admin_full_correction') THEN RAISE EXCEPTION 'FAIL audit'; END IF;
END $$;
DO $$ DECLARE n bar_cash_ups; cnt int; BEGIN
 SELECT count(*) INTO cnt FROM club_journal_entries;
 PERFORM test_full(240,580,56);
 IF (SELECT count(*) FROM club_journal_entries)<>cnt THEN RAISE EXCEPTION 'FAIL retry duplicates'; END IF;
 n:=test_full(240,580,56,false);
 IF n.written_off OR n.write_off_amount<>0 OR (SELECT sum(debit-credit) FROM club_journal_entries WHERE journal_ref=n.id AND account IN('cash','bank_current'))<>0 THEN RAISE EXCEPTION 'FAIL reconciliation toggle'; END IF;
 n:=test_full(230,575,0,true);
 IF EXISTS(SELECT 1 FROM bar_tip_payouts) OR n.tips_paid_at_cash_up<>0 OR n.expected_cash<>230 OR n.variance<>0 THEN RAISE EXCEPTION 'FAIL no payout correction'; END IF;
 n:=test_full(230,575,56,true);
 IF (SELECT sum(amount) FROM bar_tip_payouts)<>56 OR (SELECT 100-sum(amount) FROM bar_tip_payouts)<>44 THEN RAISE EXCEPTION 'FAIL re-add/staff balance'; END IF;
 IF EXISTS(SELECT 1 FROM club_journal_entries WHERE description LIKE 'Audited%' AND created_at<>n.period_end) THEN RAISE EXCEPTION 'FAIL effective correction date'; END IF;
END $$;
INSERT INTO bar_cash_ups(id,club_id,period_start,period_end,totals,expected_cash,counted_cash,variance,card_expected,card_counted,written_off,write_off_amount)
 VALUES('44444444-4444-4444-4444-444444444444','11111111-1111-1111-1111-111111111111','2026-10-22T04:46Z','2026-10-23T04:46Z','{"cash_opening":230,"tip_payouts":0,"methods":{"cash":{"sales":20,"tips":0}}}',250,250,0,0,0,true,0);
INSERT INTO bar_cash_ups(id,club_id,period_start,period_end,totals,expected_cash,counted_cash,variance,card_expected,card_counted,written_off,write_off_amount)
 VALUES('77777777-7777-7777-7777-777777777777','11111111-1111-1111-1111-111111111111','2026-10-23T04:46Z','2026-10-24T04:46Z','{"cash_opening":250,"tip_payouts":0,"methods":{"cash":{"sales":10,"tips":0}}}',260,260,0,0,0,true,0);
DO $$ DECLARE n bar_cash_ups; later bar_cash_ups; BEGIN
 n:=test_full(240,575,56,true);
 SELECT * INTO later FROM bar_cash_ups WHERE id='44444444-4444-4444-4444-444444444444';
 IF later.expected_cash<>260 OR later.counted_cash<>250 OR later.variance<>-10 OR later.write_off_amount<>-10 OR (later.totals->>'cash_opening')::numeric<>240 THEN RAISE EXCEPTION 'FAIL downstream continuity'; END IF;
 IF NOT EXISTS(SELECT 1 FROM audit_events WHERE action='opening_cash_correction') THEN RAISE EXCEPTION 'FAIL downstream audit'; END IF;
 IF NOT EXISTS(SELECT 1 FROM bar_cash_ups WHERE id='77777777-7777-7777-7777-777777777777' AND expected_cash=260 AND counted_cash=260 AND variance=0 AND (totals->>'cash_opening')::numeric=250) THEN RAISE EXCEPTION 'FAIL third shift changed despite unchanged previous count'; END IF;
 n:=test_full(240,575,40,true);
 IF n.expected_cash<>190 OR (SELECT sum(amount) FROM bar_tip_payouts)<>40 THEN RAISE EXCEPTION 'FAIL historical tips'; END IF;
 IF (SELECT sum(debit-credit) FROM club_journal_entries)<>0 THEN RAISE EXCEPTION 'FAIL history balance'; END IF;
END $$;
DO $$ BEGIN
 BEGIN PERFORM bar_cash_up_admin_correct_full('33333333-3333-3333-3333-333333333333',230,575,'stale','reason','[]',true,'{}'); RAISE EXCEPTION 'FAIL stale'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Cash-up changed; refresh before editing' THEN RAISE; END IF; END;
END $$;
INSERT INTO bar_counter_devices VALUES('55555555-5555-5555-5555-555555555555','11111111-1111-1111-1111-111111111111','Other staff');
INSERT INTO bar_tips VALUES('11111111-1111-1111-1111-111111111111','55555555-5555-5555-5555-555555555555',100,'earned','2026-10-20T00:00Z','2026-10-20T00:00Z');
INSERT INTO bar_tip_payouts VALUES('66666666-6666-6666-6666-666666666666','11111111-1111-1111-1111-111111111111','55555555-5555-5555-5555-555555555555','Other staff',80,NULL,'2026-10-23T05:00Z');
DO $$ DECLARE c bar_cash_ups; args jsonb; changes jsonb; BEGIN
 SELECT * INTO c FROM bar_cash_ups WHERE id='33333333-3333-3333-3333-333333333333';
 args:=jsonb_build_object('counted_cash',c.counted_cash,'card_counted',c.card_counted,'note',c.note,'written_off',c.written_off,'tip_payouts',coalesce((c.totals->>'tip_payouts')::numeric,0));
 changes:=jsonb_build_array(jsonb_build_object('id',md5(c.id::text||':55555555-5555-5555-5555-555555555555')::uuid,'expected_amount',0,'amount',21));
 BEGIN PERFORM bar_cash_up_admin_correct_full(c.id,c.counted_cash,c.card_counted,c.note,'Test new staff',changes,true,args); RAISE EXCEPTION 'FAIL later payout balance'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Cash payout exceeds available tips for this shift' THEN RAISE; END IF; END;
 changes:=jsonb_set(changes,'{0,amount}','20');
 PERFORM bar_cash_up_admin_correct_full(c.id,c.counted_cash,c.card_counted,c.note,'Test new staff',changes,true,args);
 IF (SELECT sum(amount) FROM bar_tip_payouts WHERE staff_id='55555555-5555-5555-5555-555555555555')<>100 THEN RAISE EXCEPTION 'FAIL added named payout'; END IF;
END $$;
