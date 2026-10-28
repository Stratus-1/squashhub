CREATE OR REPLACE FUNCTION public.bar_prepare_payroll_run_now(_club_id uuid)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r uuid; v_period date; v_since timestamptz; v_status text;
BEGIN
  IF NOT coalesce((public.is_club_admin_or_permitted(auth.uid(),_club_id,'bar') OR public.has_club_permission(auth.uid(),_club_id,'finance') OR public.has_role(auth.uid(),'admin')),false) THEN
    RAISE EXCEPTION 'Bar or finance permission required';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('bar_cash_up:'||_club_id));
  v_period := date_trunc('month',(now() AT TIME ZONE 'Africa/Johannesburg')::date)::date;
  SELECT id, status INTO r, v_status FROM bar_payroll_runs WHERE club_id=_club_id AND period=v_period;
  IF v_status = 'confirmed' THEN RAISE EXCEPTION 'This month''s payout has already been processed'; END IF;
  IF r IS NOT NULL THEN RETURN r; END IF;
  IF EXISTS(SELECT 1 FROM bar_staff_attendance WHERE club_id=_club_id AND ended_at IS NULL) THEN
    RAISE EXCEPTION 'Close unfinished attendance before processing payroll';
  END IF;
  v_since := public._bar_payroll_since(_club_id);
  INSERT INTO bar_payroll_runs(club_id,period,attendance_cutoff) VALUES(_club_id,v_period,now()) RETURNING id INTO r;
  INSERT INTO bar_payroll_run_lines(run_id,club_id,staff_id,staff_name,salary,tips,pay_basis,shifts,shift_rate,shifts_from,calculated_salary,hours,hourly_rate)
  SELECT r,x.club_id,x.id,x.label,x.pay,x.tips,x.basis,x.shifts,x.rate,v_since,x.pay,x.hours,x.hourly_rate FROM (
   SELECT d.club_id,d.id,d.label,coalesce(sal.pay_basis,'monthly') basis,
     CASE WHEN sal.pay_basis='shift' THEN public._bar_staff_shift_count(d.club_id,d.id,v_since,now()) END shifts,
     CASE WHEN sal.pay_basis='shift' THEN sal.shift_rate END rate,
     public._bar_staff_hours(d.club_id,d.id,v_since,now()) hours, sal.hourly_rate,
     CASE WHEN sal.pay_basis='hourly' THEN round(sal.hourly_rate*public._bar_staff_hours(d.club_id,d.id,v_since,now()),2)
          WHEN sal.pay_basis='shift' THEN round(sal.shift_rate*public._bar_staff_shift_count(d.club_id,d.id,v_since,now()),2)
          ELSE coalesce(sal.monthly_salary,0) END pay,
     greatest(coalesce(t.a,0)-coalesce(p.a,0),0) tips
   FROM bar_counter_devices d LEFT JOIN bar_staff_salaries sal ON sal.club_id=d.club_id AND sal.staff_id=d.id
   LEFT JOIN(SELECT bt.staff_id,sum(bt.amount) a FROM bar_staff_tip_earnings bt WHERE bt.club_id=_club_id AND bt.status='earned' GROUP BY bt.staff_id)t ON t.staff_id=d.id
   LEFT JOIN(SELECT bp.staff_id,sum(bp.amount) a FROM bar_tip_payouts bp WHERE bp.club_id=_club_id GROUP BY bp.staff_id)p ON p.staff_id=d.id
   WHERE d.club_id=_club_id AND d.active AND nullif(btrim(d.label),'') IS NOT NULL) x
  WHERE x.pay>0 OR x.tips>0 OR (x.basis='shift' AND coalesce(x.rate,0)>0) OR (x.basis='hourly' AND coalesce(x.hourly_rate,0)>0);
  RETURN r;
END $function$;
REVOKE ALL ON FUNCTION public.bar_prepare_payroll_run_now(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bar_prepare_payroll_run_now(uuid) TO authenticated;