ALTER TABLE public.bar_payroll_run_lines ADD COLUMN review jsonb NOT NULL DEFAULT '{}'::jsonb;
COMMENT ON COLUMN public.bar_payroll_run_lines.review IS 'Original payroll snapshot and approved per-run quantity/rate overrides; attendance and future staff rates remain unchanged.';
DO $ddl$
DECLARE def text; needle text := 'UPDATE bar_payroll_run_lines SET salary=(l->>''salary'')::numeric,tips=(l->>''tips'')::numeric WHERE id=row.id;'; replacement text := $body$
IF l ? 'quantity' OR l ? 'rate' THEN
 IF coalesce(l->>'quantity','') !~ '^\d{1,7}(\.\d{1,2})?$' OR coalesce(l->>'rate','') !~ '^\d{1,7}(\.\d{1,2})?$' OR (row.pay_basis='shift' AND (l->>'quantity')::numeric<>trunc((l->>'quantity')::numeric)) THEN RAISE EXCEPTION 'Invalid hours, shifts or rate for %',row.staff_name; END IF;
 UPDATE bar_payroll_run_lines SET review=jsonb_build_object('original',jsonb_build_object('hours',row.hours,'shifts',row.shifts,'rate',CASE WHEN row.pay_basis='hourly' THEN row.hourly_rate WHEN row.pay_basis='shift' THEN row.shift_rate ELSE row.salary END,'salary',row.salary,'tips',row.tips,'calculated_salary',row.calculated_salary),'approved',jsonb_build_object('quantity',(l->>'quantity')::numeric,'rate',(l->>'rate')::numeric,'salary',(l->>'salary')::numeric,'tips',(l->>'tips')::numeric,'total',(l->>'salary')::numeric+(l->>'tips')::numeric),'by',auth.uid(),'at',now()) WHERE id=row.id;
END IF;
UPDATE bar_payroll_run_lines SET salary=(l->>'salary')::numeric,tips=(l->>'tips')::numeric WHERE id=row.id;
$body$;
BEGIN
 SELECT pg_get_functiondef('public.bar_confirm_payroll_run(uuid,jsonb)'::regprocedure) INTO def;
 IF strpos(def,needle)=0 THEN RAISE EXCEPTION 'Payroll confirmation body mismatch'; END IF;
 EXECUTE replace(def,needle,replacement);
 SELECT pg_get_functiondef('public.bar_staff_pay_overview(uuid)'::regprocedure) INTO def;
 IF strpos(def,'''salary'',l.salary,''tips'',l.tips')=0 THEN RAISE EXCEPTION 'Payroll overview body mismatch'; END IF;
 EXECUTE replace(def,'''salary'',l.salary,''tips'',l.tips','''review'',l.review,''salary'',l.salary,''tips'',l.tips');
END $ddl$;