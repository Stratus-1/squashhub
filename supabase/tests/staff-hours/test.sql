SELECT set_config('test.uid','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',false);
INSERT INTO bar_counter_sessions(id,club_id,device_id,token) VALUES('44444444-4444-4444-4444-444444444444','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','55555555-5555-5555-5555-555555555555'),('66666666-6666-6666-6666-666666666666','11111111-1111-1111-1111-111111111111','33333333-3333-3333-3333-333333333333','77777777-7777-7777-7777-777777777777');
SELECT bar_counter_start_shift('55555555-5555-5555-5555-555555555555','special',now(),true);
SELECT bar_counter_start_shift('77777777-7777-7777-7777-777777777777','special',now(),true);
-- Controlled synthetic hours (6 and 2) and exact same-day shift identity.
UPDATE bar_staff_attendance SET paid_start=now()-interval '6 hours' WHERE staff_id='22222222-2222-2222-2222-222222222222';
UPDATE bar_staff_attendance SET paid_start=now()-interval '2 hours' WHERE staff_id='33333333-3333-3333-3333-333333333333';
INSERT INTO bar_tips(id,club_id,staff_id,staff_name,amount) VALUES('88888888-8888-8888-8888-888888888888','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','A',120);
UPDATE bar_tips SET status='earned' WHERE id='88888888-8888-8888-8888-888888888888';
DO $$ BEGIN IF EXISTS(SELECT 1 FROM bar_staff_tip_earnings WHERE amount>0) THEN RAISE EXCEPTION 'Unallocated tips became payable'; END IF; END $$;
SELECT bar_close_work_shift('11111111-1111-1111-1111-111111111111','55555555-5555-5555-5555-555555555555');
SELECT bar_close_work_shift('11111111-1111-1111-1111-111111111111','55555555-5555-5555-5555-555555555555');
DO $$ BEGIN IF (SELECT count(*) FROM bar_staff_attendance WHERE ended_at IS NULL)<>0 THEN RAISE EXCEPTION 'Cash-up did not close everyone'; END IF; IF (SELECT amount FROM bar_shift_tip_allocations WHERE staff_name='A')<>90 OR (SELECT amount FROM bar_shift_tip_allocations WHERE staff_name='B')<>30 THEN RAISE EXCEPTION 'Incorrect 6:2 shares'; END IF; IF (SELECT sum(amount) FROM bar_shift_tip_allocations)<>120 THEN RAISE EXCEPTION 'Duplicate allocation'; END IF; END $$;
SELECT bar_set_staff_pay('11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','hourly',50);
UPDATE club_bar_settings SET staff_payday=extract(day FROM now() AT TIME ZONE 'Africa/Johannesburg');
SELECT _bar_prepare_payroll_runs();
DO $$ DECLARE l bar_payroll_run_lines; BEGIN SELECT * INTO l FROM bar_payroll_run_lines WHERE staff_name='A'; IF l.salary<>300 OR abs(l.hours-6)>0.001 OR l.tips<>90 THEN RAISE EXCEPTION 'Hourly payroll wrong: %',to_jsonb(l); END IF; IF EXISTS(SELECT 1 FROM club_journal_entries WHERE account='bank_current') THEN RAISE EXCEPTION 'Preparation posted a payment'; END IF; END $$;
-- Management override and EFT recording only on confirmation.
SELECT bar_confirm_payroll_run((SELECT id FROM bar_payroll_runs LIMIT 1),(SELECT jsonb_agg(jsonb_build_object('id',id,'quantity',8,'rate',60,'salary',CASE WHEN staff_name='A' THEN 325 ELSE 0 END,'tips',tips)) FROM bar_payroll_run_lines));
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM bar_payroll_run_lines WHERE staff_name='A' AND (review->'approved'->>'quantity')::numeric=8 AND (review->'approved'->>'rate')::numeric=60 AND (review->'approved'->>'salary')::numeric=325 AND (review->'original'->>'salary')::numeric=300) THEN RAISE EXCEPTION 'Original and override history missing'; END IF; IF (SELECT hourly_rate FROM bar_staff_salaries WHERE staff_id='22222222-2222-2222-2222-222222222222')<>50 THEN RAISE EXCEPTION 'Payout override changed default rate'; END IF; END $$;
DO $$ BEGIN IF (SELECT sum(credit) FROM club_journal_entries WHERE account='bank_current')<>445 THEN RAISE EXCEPTION 'EFT override/tip total incorrect'; END IF; IF EXISTS(SELECT 1 FROM club_journal_entries WHERE account='cash') THEN RAISE EXCEPTION 'Payroll used cash'; END IF; END $$;
-- Multiple same-day shifts are distinct; personal exit closes only that attendee.
SELECT bar_counter_start_shift('55555555-5555-5555-5555-555555555555','normal');
SELECT bar_counter_start_shift('77777777-7777-7777-7777-777777777777','normal');
SELECT bar_counter_end_shift('55555555-5555-5555-5555-555555555555');
DO $$ BEGIN IF (SELECT count(*) FROM bar_staff_attendance WHERE staff_id='33333333-3333-3333-3333-333333333333' AND ended_at IS NULL)<>1 THEN RAISE EXCEPTION 'Exit ended other staff'; END IF; IF (SELECT count(DISTINCT shift_id) FROM bar_staff_attendance)<>2 THEN RAISE EXCEPTION 'Second daily shift missing'; END IF; BEGIN PERFORM bar_counter_start_shift('55555555-5555-5555-5555-555555555555','normal'); RAISE EXCEPTION 'Revoked accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='Revoked accepted' THEN RAISE; END IF; END; BEGIN PERFORM bar_set_staff_pay('99999999-9999-9999-9999-999999999999','22222222-2222-2222-2222-222222222222','hourly',50); RAISE EXCEPTION 'Foreign club accepted'; EXCEPTION WHEN OTHERS THEN IF SQLERRM='Foreign club accepted' THEN RAISE; END IF; END; END $$;
SELECT bar_staff_pay_overview('11111111-1111-1111-1111-111111111111');

-- Record history survives payroll; unpaid correction keeps original time in audit.
DO $$ BEGIN IF jsonb_array_length(bar_staff_attendance_log('11111111-1111-1111-1111-111111111111'))<>4 THEN RAISE EXCEPTION 'Paid history missing'; END IF; END $$;
SELECT bar_correct_staff_attendance((SELECT id FROM bar_staff_attendance WHERE staff_id='33333333-3333-3333-3333-333333333333' AND ended_at IS NULL),now(),now(),'Fictional missing exit');
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM bar_staff_attendance WHERE correction_reason='Fictional missing exit' AND jsonb_array_length(corrections)=1) THEN RAISE EXCEPTION 'Correction audit missing'; END IF; END $$;
-- Authenticated reads stay tenant-scoped and direct writes are unavailable.
SET ROLE authenticated;
DO $$ BEGIN IF (SELECT count(*) FROM bar_staff_attendance)<>4 THEN RAISE EXCEPTION 'Permitted attendance read failed'; END IF; IF has_table_privilege('authenticated','public.bar_staff_attendance','INSERT') THEN RAISE EXCEPTION 'Direct attendance write allowed'; END IF; END $$;
SELECT set_config('test.uid','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',false);
DO $$ BEGIN IF EXISTS(SELECT 1 FROM bar_staff_attendance) OR EXISTS(SELECT 1 FROM bar_shift_tip_allocations) THEN RAISE EXCEPTION 'Unauthorized financial history leak'; END IF; END $$;
RESET ROLE;
