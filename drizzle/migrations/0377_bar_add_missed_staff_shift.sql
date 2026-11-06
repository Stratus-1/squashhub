CREATE OR REPLACE FUNCTION public.bar_add_staff_attendance(_club_id uuid, _staff uuid, _start timestamptz, _end timestamptz, _reason text)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$ DECLARE w uuid; s uuid; a uuid; BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
  IF NOT public.chairman_financial_write_allowed(_club_id) THEN RAISE EXCEPTION 'Chairman financial access is view-only' USING ERRCODE='42501'; END IF;
  PERFORM public._bar_tip_authorise(_club_id, NULL);
  IF nullif(btrim(coalesce(_reason,'')),'') IS NULL OR _start IS NULL OR _end IS NULL OR _end <= _start OR _end > now() OR _end - _start > interval '24 hours' THEN
    RAISE EXCEPTION 'Valid From/To times (max 24 hours, not in the future) and a reason are required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('bar_cash_up:'||_club_id));
  PERFORM 1 FROM bar_counter_devices WHERE id=_staff AND club_id=_club_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Staff not found'; END IF;
  IF EXISTS(SELECT 1 FROM bar_payroll_runs r WHERE r.club_id=_club_id AND r.status='confirmed' AND coalesce(r.attendance_cutoff,r.confirmed_at)>=_start) THEN
    RAISE EXCEPTION 'That period has already been paid'; END IF;
  IF EXISTS(SELECT 1 FROM bar_staff_attendance b WHERE b.club_id=_club_id AND b.staff_id=_staff AND tstzrange(b.paid_start,greatest(b.paid_start,coalesce(b.ended_at,'infinity'::timestamptz)),'[)') && tstzrange(_start,_end,'[)')) THEN
    RAISE EXCEPTION 'Overlaps an existing shift for this person'; END IF;
  INSERT INTO bar_work_shifts(club_id,kind,split_tips,opened_at,closed_at,tip_sharing_mode) VALUES(_club_id,'normal',false,_start,_end,'own') RETURNING id INTO w;
  INSERT INTO bar_counter_sessions(device_id,club_id,expires_at,revoked_at,last_seen_at,created_at) VALUES(_staff,_club_id,_end,_end,_end,_start) RETURNING id INTO s;
  INSERT INTO bar_staff_attendance(club_id,shift_id,staff_id,session_id,entered_at,paid_start,ended_at,end_reason,correction_reason,corrected_by,corrections)
  VALUES(_club_id,w,_staff,s,_start,_start,_end,'management',btrim(_reason),auth.uid(),jsonb_build_array(jsonb_build_object('added',true,'after_start',_start,'after_end',_end,'reason',btrim(_reason),'by',auth.uid(),'at',now())))
  RETURNING id INTO a;
  RETURN a;
END $$;
REVOKE ALL ON FUNCTION public.bar_add_staff_attendance(uuid,uuid,timestamptz,timestamptz,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.bar_add_staff_attendance(uuid,uuid,timestamptz,timestamptz,text) TO authenticated;