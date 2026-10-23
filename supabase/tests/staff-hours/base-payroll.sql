ALTER TABLE public.club_bar_settings ADD COLUMN staff_payday integer;
ALTER TABLE public.club_bar_settings ADD CONSTRAINT club_bar_settings_staff_payday_check CHECK (staff_payday IS NULL OR staff_payday BETWEEN 1 AND 28);

CREATE TABLE public.bar_staff_salaries (
  club_id uuid NOT NULL REFERENCES public.clubs(id),
  staff_id uuid NOT NULL REFERENCES public.bar_counter_devices(id),
  monthly_salary numeric(12,2) NOT NULL DEFAULT 0 CHECK (monthly_salary >= 0 AND monthly_salary = round(monthly_salary,2)),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (club_id, staff_id)
);
GRANT SELECT ON public.bar_staff_salaries TO authenticated;
GRANT ALL ON public.bar_staff_salaries TO service_role;
ALTER TABLE public.bar_staff_salaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY bar_staff_salary_read ON public.bar_staff_salaries FOR SELECT TO authenticated USING(public.is_club_admin_or_permitted(auth.uid(),club_id,'bar') OR public.has_club_permission(auth.uid(),club_id,'finance'));

CREATE TABLE public.bar_payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id),
  period date NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  confirmed_by uuid,
  UNIQUE (club_id, period)
);
GRANT SELECT ON public.bar_payroll_runs TO authenticated;
GRANT ALL ON public.bar_payroll_runs TO service_role;
ALTER TABLE public.bar_payroll_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY bar_payroll_run_read ON public.bar_payroll_runs FOR SELECT TO authenticated USING(public.is_club_admin_or_permitted(auth.uid(),club_id,'bar') OR public.has_club_permission(auth.uid(),club_id,'finance'));

CREATE TABLE public.bar_payroll_run_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.bar_payroll_runs(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES public.clubs(id),
  staff_id uuid NOT NULL REFERENCES public.bar_counter_devices(id),
  staff_name text NOT NULL,
  salary numeric(12,2) NOT NULL DEFAULT 0 CHECK (salary >= 0 AND salary = round(salary,2)),
  tips numeric(12,2) NOT NULL DEFAULT 0 CHECK (tips >= 0 AND tips = round(tips,2)),
  tip_payout_id uuid
);
GRANT SELECT ON public.bar_payroll_run_lines TO authenticated;
GRANT ALL ON public.bar_payroll_run_lines TO service_role;
ALTER TABLE public.bar_payroll_run_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY bar_payroll_run_line_read ON public.bar_payroll_run_lines FOR SELECT TO authenticated USING(public.is_club_admin_or_permitted(auth.uid(),club_id,'bar') OR public.has_club_permission(auth.uid(),club_id,'finance'));

ALTER TABLE public.bar_tip_payouts DROP CONSTRAINT bar_tip_payouts_method_check;
ALTER TABLE public.bar_tip_payouts ADD CONSTRAINT bar_tip_payouts_method_check CHECK (method IN ('cash','salary'));

CREATE FUNCTION public.bar_set_staff_payday(_club_id uuid,_day integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN IF NOT coalesce((public.is_club_admin_or_permitted(auth.uid(),_club_id,'bar') OR public.has_club_permission(auth.uid(),_club_id,'finance') OR public.has_role(auth.uid(),'admin')),false) THEN RAISE EXCEPTION 'Bar or finance permission required'; END IF; IF _day IS NOT NULL AND (_day<1 OR _day>28) THEN RAISE EXCEPTION 'Pay day must be between 1 and 28'; END IF; INSERT INTO club_bar_settings(club_id) VALUES(_club_id) ON CONFLICT(club_id) DO NOTHING; UPDATE club_bar_settings SET staff_payday=_day,updated_at=now() WHERE club_id=_club_id; END $$;
REVOKE ALL ON FUNCTION public.bar_set_staff_payday(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bar_set_staff_payday(uuid,integer) TO authenticated;

CREATE FUNCTION public.bar_set_staff_salary(_club_id uuid,_staff_id uuid,_amount numeric) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ BEGIN IF NOT coalesce((public.is_club_admin_or_permitted(auth.uid(),_club_id,'bar') OR public.has_club_permission(auth.uid(),_club_id,'finance') OR public.has_role(auth.uid(),'admin')),false) THEN RAISE EXCEPTION 'Bar or finance permission required'; END IF; IF _amount IS NULL OR _amount<0 OR _amount::text IN ('NaN','Infinity','-Infinity') OR _amount<>round(_amount,2) THEN RAISE EXCEPTION 'Invalid salary amount'; END IF; IF NOT EXISTS(SELECT 1 FROM bar_counter_devices WHERE id=_staff_id AND club_id=_club_id) THEN RAISE EXCEPTION 'Staff not found'; END IF; INSERT INTO bar_staff_salaries(club_id,staff_id,monthly_salary,updated_at) VALUES(_club_id,_staff_id,_amount,now()) ON CONFLICT(club_id,staff_id) DO UPDATE SET monthly_salary=excluded.monthly_salary,updated_at=now(); END $$;
REVOKE ALL ON FUNCTION public.bar_set_staff_salary(uuid,uuid,numeric) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bar_set_staff_salary(uuid,uuid,numeric) TO authenticated;

CREATE FUNCTION public._bar_prepare_payroll_runs() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE s record;r uuid;today date;period date;made integer:=0; BEGIN today:=(now() AT TIME ZONE 'Africa/Johannesburg')::date; period:=date_trunc('month',today)::date; FOR s IN SELECT club_id FROM club_bar_settings WHERE staff_payday IS NOT NULL AND staff_payday=extract(day FROM today) LOOP IF EXISTS(SELECT 1 FROM bar_payroll_runs WHERE club_id=s.club_id AND period=period) THEN CONTINUE; END IF; INSERT INTO bar_payroll_runs(club_id,period) VALUES(s.club_id,period) ON CONFLICT(club_id,period) DO NOTHING RETURNING id INTO r; IF r IS NULL THEN CONTINUE; END IF; INSERT INTO bar_payroll_run_lines(run_id,club_id,staff_id,staff_name,salary,tips) SELECT r,d.club_id,d.id,d.label,coalesce(sal.monthly_salary,0),greatest(coalesce(t.a,0)-coalesce(p.a,0),0) FROM bar_counter_devices d LEFT JOIN bar_staff_salaries sal ON sal.club_id=d.club_id AND sal.staff_id=d.id LEFT JOIN(SELECT bt.staff_id,sum(bt.amount) a FROM bar_tips bt WHERE bt.club_id=s.club_id AND bt.status='earned' GROUP BY bt.staff_id)t ON t.staff_id=d.id LEFT JOIN(SELECT bp.staff_id,sum(bp.amount) a FROM bar_tip_payouts bp WHERE bp.club_id=s.club_id GROUP BY bp.staff_id)p ON p.staff_id=d.id WHERE d.club_id=s.club_id AND d.active AND nullif(btrim(d.label),'') IS NOT NULL AND (coalesce(sal.monthly_salary,0)>0 OR coalesce(t.a,0)-coalesce(p.a,0)>0); made:=made+1; END LOOP; RETURN made; END $$;
REVOKE ALL ON FUNCTION public._bar_prepare_payroll_runs() FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.bar_staff_pay_overview(_club_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$ BEGIN IF NOT coalesce((public.is_club_admin_or_permitted(auth.uid(),_club_id,'bar') OR public.has_club_permission(auth.uid(),_club_id,'finance') OR public.has_role(auth.uid(),'admin')),false) THEN RAISE EXCEPTION 'Bar or finance permission required'; END IF; RETURN (SELECT jsonb_build_object('payday',s.staff_payday,'staff',coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'name',d.label,'salary',coalesce(sal.monthly_salary,0),'earned',coalesce(t.a,0),'paid',coalesce(p.a,0),'remaining',coalesce(t.a,0)-coalesce(p.a,0)) ORDER BY d.label) FROM bar_counter_devices d LEFT JOIN bar_staff_salaries sal ON sal.club_id=d.club_id AND sal.staff_id=d.id LEFT JOIN(SELECT bt.staff_id,sum(bt.amount) a FROM bar_tips bt WHERE bt.club_id=_club_id AND bt.status='earned' GROUP BY bt.staff_id)t ON t.staff_id=d.id LEFT JOIN(SELECT bp.staff_id,sum(bp.amount) a FROM bar_tip_payouts bp WHERE bp.club_id=_club_id GROUP BY bp.staff_id)p ON p.staff_id=d.id WHERE d.club_id=_club_id AND (d.active OR t.a IS NOT NULL OR p.a IS NOT NULL)),'[]'::jsonb),'pending_run',(SELECT jsonb_build_object('id',run.id,'period',run.period,'lines',coalesce((SELECT jsonb_agg(jsonb_build_object('id',l.id,'staff_id',l.staff_id,'name',l.staff_name,'salary',l.salary,'tips',l.tips) ORDER BY l.staff_name) FROM bar_payroll_run_lines l WHERE l.run_id=run.id),'[]'::jsonb)) FROM bar_payroll_runs run WHERE run.club_id=_club_id AND run.status='pending' ORDER BY run.period DESC LIMIT 1),'confirmed_runs',coalesce((SELECT jsonb_agg(jsonb_build_object('id',run.id,'period',run.period,'confirmed_at',run.confirmed_at,'lines',(SELECT coalesce(jsonb_agg(jsonb_build_object('name',l.staff_name,'salary',l.salary,'tips',l.tips) ORDER BY l.staff_name),'[]'::jsonb) FROM bar_payroll_run_lines l WHERE l.run_id=run.id)) ORDER BY run.period DESC) FROM (SELECT * FROM bar_payroll_runs WHERE club_id=_club_id AND status='confirmed' ORDER BY period DESC LIMIT 6) run),'[]'::jsonb)) FROM club_bar_settings s WHERE s.club_id=_club_id); END $$;
REVOKE ALL ON FUNCTION public.bar_staff_pay_overview(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bar_staff_pay_overview(uuid) TO authenticated;

CREATE FUNCTION public.bar_confirm_payroll_run(_run_id uuid,_lines jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE run bar_payroll_runs;l jsonb;row bar_payroll_run_lines;balance numeric;payout uuid; BEGIN SELECT * INTO run FROM bar_payroll_runs WHERE id=_run_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Payroll run not found'; END IF; IF NOT coalesce((public.is_club_admin_or_permitted(auth.uid(),run.club_id,'bar') OR public.has_club_permission(auth.uid(),run.club_id,'finance') OR public.has_role(auth.uid(),'admin')),false) THEN RAISE EXCEPTION 'Bar or finance permission required'; END IF; IF run.status='confirmed' THEN RETURN; END IF; IF _lines IS NULL OR jsonb_typeof(_lines)<>'array' THEN RAISE EXCEPTION 'Lines are required'; END IF; FOR l IN SELECT * FROM jsonb_array_elements(_lines) LOOP SELECT * INTO row FROM bar_payroll_run_lines WHERE id=(l->>'id')::uuid AND run_id=run.id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Unknown payroll line'; END IF; IF coalesce((l->>'salary')::numeric,-1)<0 OR (l->>'salary')::numeric<>round((l->>'salary')::numeric,2) OR coalesce((l->>'tips')::numeric,-1)<0 OR (l->>'tips')::numeric<>round((l->>'tips')::numeric,2) THEN RAISE EXCEPTION 'Invalid amount for %',row.staff_name; END IF; SELECT coalesce((SELECT sum(amount) FROM bar_tips WHERE club_id=run.club_id AND staff_id=row.staff_id AND status='earned'),0)-coalesce((SELECT sum(amount) FROM bar_tip_payouts WHERE club_id=run.club_id AND staff_id=row.staff_id),0) INTO balance; IF (l->>'tips')::numeric>balance THEN RAISE EXCEPTION 'Tips for % exceed unpaid tips',row.staff_name; END IF; UPDATE bar_payroll_run_lines SET salary=(l->>'salary')::numeric,tips=(l->>'tips')::numeric WHERE id=row.id; END LOOP; FOR row IN SELECT * FROM bar_payroll_run_lines WHERE run_id=run.id AND (salary>0 OR tips>0) LOOP IF row.tips>0 THEN payout:=gen_random_uuid(); INSERT INTO bar_tip_payouts(id,club_id,staff_id,staff_name,amount,method,actor_user_id) VALUES(payout,run.club_id,row.staff_id,row.staff_name,row.tips,'salary',auth.uid()); INSERT INTO club_journal_entries(club_id,journal_ref,account,debit,credit,description) VALUES(run.club_id,payout,'bar_cost_of_sales',row.tips,0,'Tips paid — '||row.staff_name),(run.club_id,payout,'bank_current',0,row.tips,'Tips paid — '||row.staff_name); UPDATE bar_payroll_run_lines SET tip_payout_id=payout WHERE id=row.id; END IF; IF row.salary>0 THEN INSERT INTO club_journal_entries(club_id,journal_ref,account,debit,credit,description) VALUES(run.club_id,row.id,'bar_cost_of_sales',row.salary,0,'Salary — '||row.staff_name),(run.club_id,row.id,'bank_current',0,row.salary,'Salary — '||row.staff_name); END IF; END LOOP; UPDATE bar_payroll_runs SET status='confirmed',confirmed_at=now(),confirmed_by=auth.uid() WHERE id=run.id; END $$;
REVOKE ALL ON FUNCTION public.bar_confirm_payroll_run(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bar_confirm_payroll_run(uuid,jsonb) TO authenticated;

