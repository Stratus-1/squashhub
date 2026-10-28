CREATE OR REPLACE FUNCTION public.bar_counter_start_shift(_token uuid, _kind text, _start timestamp with time zone DEFAULT NULL::timestamp with time zone, _split boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE s bar_counter_sessions;w bar_work_shifts;a bar_staff_attendance;opening time;paid timestamptz; BEGIN
 SELECT * INTO s FROM bar_counter_sessions WHERE token=_token FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Personal counter PIN required'; END IF; PERFORM _bar_tip_authorise(s.club_id,_token); PERFORM pg_advisory_xact_lock(hashtext('bar_cash_up:'||s.club_id));
 IF _kind NOT IN ('normal','special') OR _kind IS NULL OR (_split AND _kind<>'special') THEN RAISE EXCEPTION 'Invalid shift type'; END IF;
 SELECT * INTO a FROM bar_staff_attendance WHERE club_id=s.club_id AND staff_id=s.device_id AND ended_at IS NULL FOR UPDATE;
 IF FOUND THEN IF a.session_id<>s.id THEN UPDATE bar_staff_attendance SET session_id=s.id WHERE id=a.id RETURNING * INTO a; END IF; RETURN to_jsonb(a); END IF;
 SELECT * INTO w FROM bar_work_shifts WHERE club_id=s.club_id AND closed_at IS NULL FOR UPDATE;
 IF FOUND AND (w.kind<>_kind OR w.split_tips<>coalesce(_split,false)) THEN RAISE EXCEPTION 'Join the current shift using its existing type and tip-sharing setting'; END IF;
 IF _kind='special' THEN
   -- The entered start time is the paid start (e.g. 08:00 entered at 10:00 starts at 08:00), limited to today's working window.
   IF _start IS NULL OR _start<now()-interval '12 hours' OR _start>now()+interval '24 hours' THEN RAISE EXCEPTION 'Enter a start time within the last 12 hours; older attendance needs management correction'; END IF;
   paid:=_start;
 ELSE SELECT staff_normal_opening INTO opening FROM club_bar_settings WHERE club_id=s.club_id; paid:=greatest(now(),(((now() AT TIME ZONE 'Africa/Johannesburg')::date+coalesce(opening,'16:00'::time)) AT TIME ZONE 'Africa/Johannesburg')); END IF;
 IF w.id IS NULL THEN INSERT INTO bar_work_shifts(club_id,kind,split_tips) VALUES(s.club_id,_kind,coalesce(_split,false)) RETURNING * INTO w; END IF;
 INSERT INTO bar_staff_attendance(club_id,shift_id,staff_id,session_id,paid_start) VALUES(s.club_id,w.id,s.device_id,s.id,paid) RETURNING * INTO a; RETURN to_jsonb(a); END $function$;