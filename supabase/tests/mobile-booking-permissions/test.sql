-- Synthetic records live only in the disposable cluster created by run.sh.
INSERT INTO clubs(id) VALUES ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
INSERT INTO club_members(id,club_id,user_id) VALUES
('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000021'),
('00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000022');
INSERT INTO courts(id,club_id) VALUES (1,'00000000-0000-0000-0000-000000000001'),(2,'00000000-0000-0000-0000-000000000001');
INSERT INTO club_member_permissions(club_member_id) VALUES ('00000000-0000-0000-0000-000000000011');
INSERT INTO bookings(club_id,court_id,date,start_time,end_time,club_member_id,opponent_member_id) VALUES
('00000000-0000-0000-0000-000000000001',1,'2099-11-04','16:00','16:30','00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000012'),
('00000000-0000-0000-0000-000000000001',1,'2099-11-04','10:00','10:30','00000000-0000-0000-0000-000000000011',NULL);
CREATE FUNCTION test_ready(t time, expected text DEFAULT NULL, opponent uuid DEFAULT NULL, duration integer DEFAULT 30, court integer DEFAULT 2, club uuid DEFAULT '00000000-0000-0000-0000-000000000001') RETURNS void LANGUAGE plpgsql AS $$
DECLARE msg text;
BEGIN
 BEGIN
  PERFORM mobile_booking_assert_ready('test-only',club,'00000000-0000-0000-0000-000000000011',court,'2099-11-04',t,duration,opponent);
 EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS msg=MESSAGE_TEXT;
 END;
 IF expected IS NULL AND msg IS NOT NULL THEN RAISE EXCEPTION 'Expected allowed at %, got %',t,msg; END IF;
 IF expected IS NOT NULL AND (msg IS NULL OR position(expected in msg)=0) THEN RAISE EXCEPTION 'Expected % at %, got %',expected,t,msg; END IF;
END $$;
CREATE FUNCTION test_slot(t text, expected boolean) RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual boolean;
BEGIN
 SELECT (s->>'available')::boolean INTO actual
 FROM jsonb_array_elements(mobile_booking_availability('test-only','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000011','2099-11-04')->'courts') c,
 jsonb_array_elements(c->'slots') s WHERE c->>'courtId'='2' AND s->>'startTime'=t;
 IF actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Availability % expected %, got %',t,expected,actual; END IF;
END $$;
-- Ordinary member: daily, peak, back-to-back remain enforced independently.
SELECT test_ready('17:00','Daily booking limit'), test_slot('17:00',false);
UPDATE clubs SET max_bookings_per_day=10;
SELECT test_ready('17:00','Peak booking limit'), test_slot('17:00',false);
UPDATE clubs SET max_peak_bookings_per_day=10;
SELECT test_ready('16:30','Back-to-back'), test_slot('16:30',false);
UPDATE clubs SET max_bookings_per_day=1,max_peak_bookings_per_day=1;
-- Club admin bypasses all three caps, including selected opponent's cap checks.
UPDATE club_members SET role='admin' WHERE id='00000000-0000-0000-0000-000000000011';
SELECT test_ready('16:30',NULL,'00000000-0000-0000-0000-000000000012'), test_slot('16:30',true);
UPDATE club_members SET role='member';
-- Explicit full-admin grant follows the same existing web helper.
UPDATE club_member_permissions SET is_full_admin=true;
SELECT test_ready('16:30'),test_slot('16:30',true);
UPDATE club_member_permissions SET is_full_admin=false,custom_permissions=ARRAY['bookings_unlimited'];
SELECT test_ready('16:30'),test_slot('16:30',true);
-- Permission-role inherited unlimited is also honored.
UPDATE club_member_permissions SET custom_permissions='{}',permission_role_id='00000000-0000-0000-0000-000000000031';
INSERT INTO club_permission_roles VALUES ('00000000-0000-0000-0000-000000000031',ARRAY['bookings_unlimited']);
SELECT test_ready('16:30'),test_slot('16:30',true);
UPDATE club_member_permissions SET permission_role_id=NULL,custom_permissions=ARRAY['bookings_unlimited_non_peak'];
SELECT test_ready('10:30'),test_slot('10:30',true);
SELECT test_ready('16:30','Daily booking limit'),test_slot('16:30',false);
-- Start-time classification: a slot crossing peak start is off-peak; peak end is exclusive.
SELECT test_ready('15:30'),test_slot('15:30',true),test_ready('19:00'),test_slot('19:00',true);
-- Explicit off-day override must not become NULL/deny bypass.
UPDATE clubs SET peak_day_overrides=jsonb_build_object(extract(dow FROM date '2099-11-04')::integer::text,jsonb_build_object('off',true));
SELECT test_ready('16:30'),test_slot('16:30',true);
UPDATE clubs SET peak_day_overrides=NULL;
-- Unlimited never bypasses membership, suspension, balance, grid/hours or collisions.
UPDATE club_member_permissions SET custom_permissions=ARRAY['bookings_unlimited'];
SELECT test_ready('16:00','overlaps'),test_ready('04:30','outside'),test_ready('17:15','booking grid'),test_ready('17:00','30 minute slots',NULL,60);
SELECT test_ready('16:00','already booked',NULL,30,1);
SELECT test_ready('17:00','does not belong',NULL,30,2,'00000000-0000-0000-0000-000000000002');
UPDATE club_members SET status='suspended' WHERE id='00000000-0000-0000-0000-000000000011';
SELECT test_ready('17:00','cannot book');
UPDATE club_members SET status='active',suspension_manual=true,suspension_status='manual_hold' WHERE id='00000000-0000-0000-0000-000000000011';
SELECT test_ready('17:00','cannot book');
UPDATE club_members SET suspension_manual=false,suspension_status='suspended' WHERE id='00000000-0000-0000-0000-000000000011';
UPDATE clubs SET suspension_rules='{"enabled":true,"blocks":["bookings"]}';
SELECT test_ready('17:00','cannot book');
UPDATE club_members SET suspension_status='active';
SELECT set_config('test.balance_allowed','false',false);
SELECT test_ready('17:00','below the minimum');
SELECT set_config('test.balance_allowed','true',false);
UPDATE clubs SET allow_solo_bookings=false;
SELECT test_ready('17:00','does not allow solo');
UPDATE clubs SET allow_solo_bookings=true;
-- An opponent's privilege must not grant the actor a bypass.
UPDATE club_member_permissions SET custom_permissions='{}';
UPDATE club_members SET role='admin' WHERE id='00000000-0000-0000-0000-000000000012';
SELECT test_ready('17:00','Daily booking limit','00000000-0000-0000-0000-000000000012');
-- Existing grants preserved for both secret-gated RPCs, PUBLIC stays revoked.
DO $$ DECLARE f regprocedure; r text; BEGIN
 FOREACH f IN ARRAY ARRAY['mobile_booking_assert_ready(text,uuid,uuid,integer,date,time,integer,uuid,uuid,text)'::regprocedure,'mobile_booking_availability(text,uuid,uuid,date)'::regprocedure] LOOP
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
   IF NOT has_function_privilege(r,f,'EXECUTE') THEN RAISE EXCEPTION 'Missing % grant on %',r,f; END IF;
  END LOOP;
 END LOOP;
END $$;
