-- Fictional local records only; never run against the hosted club.
SELECT set_config('test.uid','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',false);
UPDATE bar_counter_sessions SET revoked_at=NULL;
SELECT bar_close_work_shift('11111111-1111-1111-1111-111111111111','77777777-7777-7777-7777-777777777777');
SELECT bar_counter_start_shift_with_tips('55555555-5555-5555-5555-555555555555','special',now(),'equal');
DO $$ BEGIN
 BEGIN
  PERFORM bar_counter_start_shift_with_tips('77777777-7777-7777-7777-777777777777','special',now(),'hours');
  RAISE EXCEPTION 'Changed existing shift policy';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM<>'Join the current shift using its existing tip-sharing setting' THEN RAISE; END IF; END;
END $$;
SELECT bar_counter_start_shift_with_tips('77777777-7777-7777-7777-777777777777','special',now(),'equal');
UPDATE bar_staff_attendance SET paid_start=now()-interval '6 hours' WHERE ended_at IS NULL AND staff_id='22222222-2222-2222-2222-222222222222';
UPDATE bar_staff_attendance SET paid_start=now()-interval '2 hours' WHERE ended_at IS NULL AND staff_id='33333333-3333-3333-3333-333333333333';
INSERT INTO bar_tips(id,club_id,staff_id,staff_name,amount) VALUES('88888888-8888-8888-8888-888888888889','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','A',120.01);
UPDATE bar_tips SET status='earned' WHERE id='88888888-8888-8888-8888-888888888889';
SELECT bar_close_work_shift('11111111-1111-1111-1111-111111111111','55555555-5555-5555-5555-555555555555');
SELECT bar_review_shift_tips('11111111-1111-1111-1111-111111111111');
DO $$ BEGIN
 IF (SELECT amount FROM bar_shift_tip_allocations WHERE tip_id='88888888-8888-8888-8888-888888888889' AND staff_name='A') IS DISTINCT FROM 60.01 OR (SELECT amount FROM bar_shift_tip_allocations WHERE tip_id='88888888-8888-8888-8888-888888888889' AND staff_name='B') IS DISTINCT FROM 60 THEN RAISE EXCEPTION 'Equal shares or remainder incorrect'; END IF;
 IF (SELECT count(*) FROM bar_shift_tip_allocations WHERE tip_id='88888888-8888-8888-8888-888888888889')<>2 THEN RAISE EXCEPTION 'Repeated allocation'; END IF;
 IF (SELECT amount FROM bar_shift_tip_allocations WHERE tip_id='88888888-8888-8888-8888-888888888888' AND staff_name='A') IS DISTINCT FROM 90 THEN RAISE EXCEPTION 'Legacy hours shares changed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(bar_staff_attendance_log('11111111-1111-1111-1111-111111111111')) a WHERE a->>'tip_sharing_mode'='equal') THEN RAISE EXCEPTION 'Equal shift history missing'; END IF;
END $$;
SELECT bar_counter_start_shift_with_tips('55555555-5555-5555-5555-555555555555','special',now(),'own');
SELECT bar_counter_start_shift_with_tips('77777777-7777-7777-7777-777777777777','special',now(),'own');
INSERT INTO bar_tips(id,club_id,staff_id,staff_name,amount) VALUES('88888888-8888-8888-8888-888888888890','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','A',25);
UPDATE bar_tips SET status='earned' WHERE id='88888888-8888-8888-8888-888888888890';
SELECT bar_close_work_shift('11111111-1111-1111-1111-111111111111','55555555-5555-5555-5555-555555555555');
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM bar_shift_tip_allocations WHERE tip_id='88888888-8888-8888-8888-888888888890') OR NOT EXISTS(SELECT 1 FROM bar_staff_tip_earnings WHERE id='88888888-8888-8888-8888-888888888890' AND staff_name='A' AND amount=25) THEN RAISE EXCEPTION 'Own tips were shared'; END IF;
END $$;