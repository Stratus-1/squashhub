SELECT set_config('test.uid','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',false);
CREATE FUNCTION test_correction(amount numeric,reason text DEFAULT 'Correct paid tips', expected numeric DEFAULT 40) RETURNS bar_cash_ups LANGUAGE sql AS $$
 SELECT bar_cash_up_admin_correct('33333333-3333-3333-3333-333333333333',230,575,'Test',reason,
 jsonb_build_array(jsonb_build_object('id',md5('33333333-3333-3333-3333-333333333333:22222222-2222-2222-2222-222222222222')::uuid,'amount',amount,'expected_amount',expected))) $$;
DO $$ BEGIN
 BEGIN PERFORM test_correction(-56); RAISE EXCEPTION 'FAIL negative accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Tips paid out must be positive%' THEN RAISE; END IF; END;
END $$;
DO $$ BEGIN
 BEGIN PERFORM test_correction(0); RAISE EXCEPTION 'FAIL zero accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Tips paid out must be positive%' THEN RAISE; END IF; END;
END $$;
DO $$ BEGIN
 BEGIN PERFORM test_correction(56.001); RAISE EXCEPTION 'FAIL precision accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'Tips paid out must be positive%' THEN RAISE; END IF; END;
END $$;
DO $$ BEGIN
 BEGIN PERFORM test_correction(56,''); RAISE EXCEPTION 'FAIL missing reason accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'A reason is required' THEN RAISE; END IF; END;
END $$;
DO $$ BEGIN
 PERFORM set_config('test.uid','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',false);
 BEGIN PERFORM test_correction(56); RAISE EXCEPTION 'FAIL unauthorized accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Bar or finance permission required' THEN RAISE; END IF; END;
 PERFORM set_config('test.uid','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',false);
END $$;
DO $$ BEGIN
 BEGIN PERFORM test_correction(101); RAISE EXCEPTION 'FAIL overbalance accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Cash payout exceeds unpaid tips' THEN RAISE; END IF; END;
END $$;
DO $$ DECLARE n bar_cash_ups; BEGIN
 n:=test_correction(56);
 IF n.counted_cash<>230 OR n.expected_cash<>174 OR n.variance<>56 OR n.write_off_amount<>56 OR n.tips_paid_at_cash_up<>56 OR (n.totals->>'tip_payouts')::numeric<>56 THEN RAISE EXCEPTION 'FAIL R56 accounting or R230 counted cash'; END IF;
 IF n.period_start<>'2026-10-21T00:00Z' OR n.period_end<>'2026-10-22T04:46Z' THEN RAISE EXCEPTION 'FAIL dates changed'; END IF;
 IF (SELECT amount FROM bar_tip_payouts)<>56 OR (SELECT 100-sum(amount) FROM bar_tip_payouts)<>44 THEN RAISE EXCEPTION 'FAIL staff balance'; END IF;
 IF (SELECT sum(debit-credit) FROM club_journal_entries)<>0 OR (SELECT sum(debit-credit) FROM club_journal_entries WHERE account='cash')<>0 THEN RAISE EXCEPTION 'FAIL unbalanced journal or counted cash changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM audit_events WHERE action='admin_tip_correction' AND (before_data->'payouts'->0->>'amount')::numeric=40 AND (after_data->'payouts'->0->>'amount')::numeric=56) THEN RAISE EXCEPTION 'FAIL audit missing'; END IF;
END $$;
DO $$ DECLARE journal_count int; BEGIN
 SELECT count(*) INTO journal_count FROM club_journal_entries;
 PERFORM test_correction(56);
 IF (SELECT count(*) FROM club_journal_entries)<>journal_count THEN RAISE EXCEPTION 'FAIL retry posted twice'; END IF;
 BEGIN PERFORM test_correction(60); RAISE EXCEPTION 'FAIL stale amount accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Paid tips changed; refresh before editing' THEN RAISE; END IF; END;
END $$;
DO $$ BEGIN
 INSERT INTO bar_cash_ups(id,club_id,period_start,period_end,counted_cash) VALUES('44444444-4444-4444-4444-444444444444','11111111-1111-1111-1111-111111111111','2026-10-22T04:46Z','2026-10-23T04:46Z',230);
 BEGIN PERFORM test_correction(60,'Test',56); RAISE EXCEPTION 'FAIL older correction accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Only the most recent cash-up can have paid tips corrected' THEN RAISE; END IF; END;
 DELETE FROM bar_cash_ups WHERE id='44444444-4444-4444-4444-444444444444';
END $$;
DO $$ BEGIN
 PERFORM bar_cash_up_undo('33333333-3333-3333-3333-333333333333','Test undo corrected cash-up');
 IF EXISTS(SELECT 1 FROM bar_cash_ups) OR EXISTS(SELECT 1 FROM bar_tip_payouts) THEN RAISE EXCEPTION 'FAIL undo did not return payout'; END IF;
 IF EXISTS(SELECT account FROM club_journal_entries GROUP BY account HAVING sum(debit-credit)<>0) THEN RAISE EXCEPTION 'FAIL undo did not reverse correction exactly'; END IF;
END $$;