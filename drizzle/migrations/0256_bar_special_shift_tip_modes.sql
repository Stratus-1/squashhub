ALTER TABLE public.bar_work_shifts ADD COLUMN tip_sharing_mode text;
ALTER TABLE public.bar_work_shifts ADD CONSTRAINT bar_work_shift_tip_mode_check CHECK (tip_sharing_mode IS NULL OR (tip_sharing_mode IN ('own','hours','equal') AND split_tips=(tip_sharing_mode<>'own') AND (kind='special' OR tip_sharing_mode='own')));
COMMENT ON COLUMN public.bar_work_shifts.tip_sharing_mode IS 'Explicit new-shift tip policy. NULL preserves legacy split_tips: true means hours, false means own. Never reinterpret saved allocations.';
CREATE FUNCTION public.bar_counter_start_shift_with_tips(_token uuid,_kind text,_start timestamptz DEFAULT NULL,_tip_mode text DEFAULT 'own') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s bar_counter_sessions; w bar_work_shifts; result jsonb;
BEGIN
 SELECT * INTO s FROM bar_counter_sessions WHERE token=_token FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Personal counter PIN required'; END IF;
 PERFORM _bar_tip_authorise(s.club_id,_token);
 PERFORM pg_advisory_xact_lock(hashtext('bar_cash_up:'||s.club_id));
 IF _tip_mode IS NULL OR _tip_mode NOT IN ('own','hours','equal') OR (_kind='normal' AND _tip_mode<>'own') THEN RAISE EXCEPTION 'Invalid tip sharing choice'; END IF;
 SELECT * INTO w FROM bar_work_shifts WHERE club_id=s.club_id AND closed_at IS NULL FOR UPDATE;
 IF FOUND AND coalesce(w.tip_sharing_mode,CASE WHEN w.split_tips THEN 'hours' ELSE 'own' END)<>_tip_mode THEN RAISE EXCEPTION 'Join the current shift using its existing tip-sharing setting'; END IF;
 result:=bar_counter_start_shift(_token,_kind,_start,_tip_mode<>'own');
 IF w.id IS NULL THEN UPDATE bar_work_shifts SET tip_sharing_mode=_tip_mode WHERE id=(result->>'shift_id')::uuid AND club_id=s.club_id AND tip_sharing_mode IS NULL; END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.bar_counter_start_shift_with_tips(uuid,text,timestamptz,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bar_counter_start_shift_with_tips(uuid,text,timestamptz,text) TO anon,authenticated;
DO $ddl$ DECLARE def text; BEGIN
 SELECT pg_get_functiondef('public._bar_allocate_shift_tip(uuid)'::regprocedure) INTO def;
 IF position('floor(cents*hours/total_hours)' IN def)=0 THEN RAISE EXCEPTION 'Tip allocator changed; review required'; END IF;
 def:=replace(def,'total_hours numeric;','total_hours numeric; equal_split boolean;');
 def:=replace(def,'SELECT sum(greatest(extract(epoch FROM(a.ended_at-a.paid_start)),0)/3600) INTO total_hours FROM bar_staff_attendance a WHERE a.shift_id=t.work_shift_id;', 'SELECT coalesce(tip_sharing_mode=''equal'',false) INTO equal_split FROM bar_work_shifts WHERE id=t.work_shift_id; SELECT CASE WHEN equal_split THEN count(DISTINCT a.staff_id)::numeric ELSE sum(greatest(extract(epoch FROM(a.ended_at-a.paid_start)),0)/3600) END INTO total_hours FROM bar_staff_attendance a WHERE a.shift_id=t.work_shift_id AND a.ended_at>a.paid_start;');
 def:=replace(def,'cents*hours/total_hours','cents*(CASE WHEN equal_split THEN 1 ELSE hours END)/total_hours');
 IF position('INTO equal_split' IN def)=0 THEN RAISE EXCEPTION 'Equal sharing replacement failed'; END IF;
 EXECUTE def;
 SELECT pg_get_functiondef('public.bar_staff_attendance_log(uuid)'::regprocedure) INTO def;
 def:=replace(def,'''split_tips'',w.split_tips,','''split_tips'',w.split_tips,''tip_sharing_mode'',coalesce(w.tip_sharing_mode,CASE WHEN w.split_tips THEN ''hours'' ELSE ''own'' END),');
 IF position('''tip_sharing_mode''' IN def)=0 THEN RAISE EXCEPTION 'Attendance log replacement failed'; END IF;
 EXECUTE def;
END $ddl$;