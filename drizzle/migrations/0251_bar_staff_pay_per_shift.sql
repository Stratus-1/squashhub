ALTER TABLE public.bar_staff_salaries ADD COLUMN pay_basis text NOT NULL DEFAULT 'monthly' CHECK (pay_basis IN ('monthly','shift'));
ALTER TABLE public.bar_staff_salaries ADD COLUMN shift_rate numeric(12,2) NOT NULL DEFAULT 0 CHECK (shift_rate >= 0 AND shift_rate = round(shift_rate,2));
ALTER TABLE public.bar_payroll_run_lines ADD COLUMN pay_basis text NOT NULL DEFAULT 'monthly' CHECK (pay_basis IN ('monthly','shift'));
ALTER TABLE public.bar_payroll_run_lines ADD COLUMN shifts integer;
ALTER TABLE public.bar_payroll_run_lines ADD COLUMN shift_rate numeric(12,2);
ALTER TABLE public.bar_payroll_run_lines ADD COLUMN shifts_from timestamptz;
ALTER TABLE public.bar_payroll_run_lines ADD COLUMN calculated_salary numeric(12,2);

-- A shift = a distinct Johannesburg calendar day on which the person signed in at the counter with their PIN.
CREATE OR REPLACE FUNCTION public._bar_staff_shift_count(_club_id uuid,_staff_id uuid,_from timestamptz,_to timestamptz) RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT count(DISTINCT (s.created_at AT TIME ZONE 'Africa/Johannesburg')::date)::integer FROM bar_counter_sessions s WHERE s.club_id=_club_id AND s.device_id=_staff_id AND s.created_at>=_from AND s.created_at<_to $$;
REVOKE ALL ON FUNCTION public._bar_staff_shift_count(uuid,uuid,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;

-- Shifts are counted since the club's last confirmed payout, or the previous month for the first run.
CREATE OR REPLACE FUNCTION public._bar_payroll_since(_club_id uuid) RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT coalesce((SELECT max(r.confirmed_at) FROM bar_payroll_runs r WHERE r.club_id=_club_id AND r.status='confirmed'), now()-interval '1 month') $$;
REVOKE ALL ON FUNCTION public._bar_payroll_since(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.bar_set_staff_pay(_club_id uuid,_staff_id uuid,_basis text,_amount numeric) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN
 IF NOT coalesce((public.is_club_admin_or_permitted(auth.uid(),_club_id,'bar') OR public.has_club_permission(auth.uid(),_club_id,'finance') OR public.has_role(auth.uid(),'admin')),false) THEN RAISE EXCEPTION 'Bar or finance permission required'; END IF;
 IF _basis NOT IN ('monthly','shift') THEN RAISE EXCEPTION 'Pay basis must be monthly or per shift'; END IF;
 IF _amount IS NULL OR _amount<0 OR _amount::text IN ('NaN','Infinity','-Infinity') OR _amount<>round(_amount,2) THEN RAISE EXCEPTION 'Invalid amount'; END IF;
 IF NOT EXISTS(SELECT 1 FROM bar_counter_devices WHERE id=_staff_id AND club_id=_club_id) THEN RAISE EXCEPTION 'Staff not found'; END IF;
 INSERT INTO bar_staff_salaries(club_id,staff_id,pay_basis,monthly_salary,shift_rate,updated_at)
 VALUES(_club_id,_staff_id,_basis,CASE WHEN _basis='monthly' THEN _amount ELSE 0 END,CASE WHEN _basis='shift' THEN _amount ELSE 0 END,now())
 ON CONFLICT(club_id,staff_id) DO UPDATE SET pay_basis=excluded.pay_basis,
   monthly_salary=CASE WHEN excluded.pay_basis='monthly' THEN excluded.monthly_salary ELSE bar_staff_salaries.monthly_salary END,
   shift_rate=CASE WHEN excluded.pay_basis='shift' THEN excluded.shift_rate ELSE bar_staff_salaries.shift_rate END, updated_at=now(); END $$;
REVOKE ALL ON FUNCTION public.bar_set_staff_pay(uuid,uuid,text,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bar_set_staff_pay(uuid,uuid,text,numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public._bar_prepare_payroll_runs() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE s record;r uuid;v_today date;v_period date;v_last_day integer;v_since timestamptz;made integer:=0; BEGIN
 v_today:=(now() AT TIME ZONE 'Africa/Johannesburg')::date; v_period:=date_trunc('month',v_today)::date;
 v_last_day:=extract(day FROM (date_trunc('month',v_today)::date + interval '1 month' - interval '1 day'))::integer;
 FOR s IN SELECT cbs.club_id, cbs.staff_payday FROM club_bar_settings cbs WHERE cbs.staff_payday IS NOT NULL AND extract(day FROM v_today)=least(cbs.staff_payday,v_last_day) LOOP
  IF EXISTS(SELECT 1 FROM bar_payroll_runs bpr WHERE bpr.club_id=s.club_id AND bpr.period=v_period) THEN CONTINUE; END IF;
  v_since:=public._bar_payroll_since(s.club_id);
  INSERT INTO bar_payroll_runs(club_id,period) VALUES(s.club_id,v_period) ON CONFLICT(club_id,period) DO NOTHING RETURNING id INTO r;
  IF r IS NULL THEN CONTINUE; END IF;
  INSERT INTO bar_payroll_run_lines(run_id,club_id,staff_id,staff_name,salary,tips,pay_basis,shifts,shift_rate,shifts_from,calculated_salary)
  SELECT r,x.club_id,x.id,x.label,x.pay,x.tips,x.basis,x.shifts,x.rate,v_since,x.pay FROM (
   SELECT d.club_id,d.id,d.label,coalesce(sal.pay_basis,'monthly') basis,
     CASE WHEN sal.pay_basis='shift' THEN public._bar_staff_shift_count(d.club_id,d.id,v_since,now()) END shifts,
     CASE WHEN sal.pay_basis='shift' THEN sal.shift_rate END rate,
     CASE WHEN sal.pay_basis='shift' THEN round(sal.shift_rate*public._bar_staff_shift_count(d.club_id,d.id,v_since,now()),2) ELSE coalesce(sal.monthly_salary,0) END pay,
     greatest(coalesce(t.a,0)-coalesce(p.a,0),0) tips
   FROM bar_counter_devices d LEFT JOIN bar_staff_salaries sal ON sal.club_id=d.club_id AND sal.staff_id=d.id
   LEFT JOIN(SELECT bt.staff_id,sum(bt.amount) a FROM bar_tips bt WHERE bt.club_id=s.club_id AND bt.status='earned' GROUP BY bt.staff_id)t ON t.staff_id=d.id
   LEFT JOIN(SELECT bp.staff_id,sum(bp.amount) a FROM bar_tip_payouts bp WHERE bp.club_id=s.club_id GROUP BY bp.staff_id)p ON p.staff_id=d.id
   WHERE d.club_id=s.club_id AND d.active AND nullif(btrim(d.label),'') IS NOT NULL) x
  WHERE x.pay>0 OR x.tips>0 OR (x.basis='shift' AND coalesce(x.rate,0)>0);
  made:=made+1; END LOOP; RETURN made; END $$;
REVOKE ALL ON FUNCTION public._bar_prepare_payroll_runs() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.bar_staff_pay_overview(_club_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ DECLARE v_since timestamptz; BEGIN
 IF NOT coalesce((public.is_club_admin_or_permitted(auth.uid(),_club_id,'bar') OR public.has_club_permission(auth.uid(),_club_id,'finance') OR public.has_role(auth.uid(),'admin')),false) THEN RAISE EXCEPTION 'Bar or finance permission required'; END IF;
 v_since:=public._bar_payroll_since(_club_id);
 RETURN (SELECT jsonb_build_object('payday',s.staff_payday,'shifts_since',v_since,
  'staff',coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'name',d.label,'pay_basis',coalesce(sal.pay_basis,'monthly'),'salary',coalesce(sal.monthly_salary,0),'shift_rate',coalesce(sal.shift_rate,0),'shifts',public._bar_staff_shift_count(_club_id,d.id,v_since,now()),'earned',coalesce(t.a,0),'paid',coalesce(p.a,0),'remaining',coalesce(t.a,0)-coalesce(p.a,0)) ORDER BY d.label)
    FROM bar_counter_devices d LEFT JOIN bar_staff_salaries sal ON sal.club_id=d.club_id AND sal.staff_id=d.id
    LEFT JOIN(SELECT bt.staff_id,sum(bt.amount) a FROM bar_tips bt WHERE bt.club_id=_club_id AND bt.status='earned' GROUP BY bt.staff_id)t ON t.staff_id=d.id
    LEFT JOIN(SELECT bp.staff_id,sum(bp.amount) a FROM bar_tip_payouts bp WHERE bp.club_id=_club_id GROUP BY bp.staff_id)p ON p.staff_id=d.id
    WHERE d.club_id=_club_id AND (d.active OR t.a IS NOT NULL OR p.a IS NOT NULL)),'[]'::jsonb),
  'pending_run',(SELECT jsonb_build_object('id',run.id,'period',run.period,'lines',coalesce((SELECT jsonb_agg(jsonb_build_object('id',l.id,'staff_id',l.staff_id,'name',l.staff_name,'salary',l.salary,'tips',l.tips,'pay_basis',l.pay_basis,'shifts',l.shifts,'shift_rate',l.shift_rate,'shifts_from',l.shifts_from,'calculated_salary',l.calculated_salary) ORDER BY l.staff_name) FROM bar_payroll_run_lines l WHERE l.run_id=run.id),'[]'::jsonb)) FROM bar_payroll_runs run WHERE run.club_id=_club_id AND run.status='pending' ORDER BY run.period DESC LIMIT 1),
  'confirmed_runs',coalesce((SELECT jsonb_agg(jsonb_build_object('id',run.id,'period',run.period,'confirmed_at',run.confirmed_at,'lines',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',l.staff_name,'salary',l.salary,'tips',l.tips,'pay_basis',l.pay_basis,'shifts',l.shifts,'shift_rate',l.shift_rate,'calculated_salary',l.calculated_salary) ORDER BY l.staff_name),'[]'::jsonb) FROM bar_payroll_run_lines l WHERE l.run_id=run.id)) ORDER BY run.period DESC) FROM (SELECT * FROM bar_payroll_runs WHERE club_id=_club_id AND status='confirmed' ORDER BY period DESC LIMIT 6) run),'[]'::jsonb))
 FROM club_bar_settings s WHERE s.club_id=_club_id); END $$;
REVOKE ALL ON FUNCTION public.bar_staff_pay_overview(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bar_staff_pay_overview(uuid) TO authenticated;