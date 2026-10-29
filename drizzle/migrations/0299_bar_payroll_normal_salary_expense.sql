DO $migration$
DECLARE definition text;
BEGIN
  SELECT pg_get_functiondef('public.bar_confirm_payroll_run(uuid,jsonb)'::regprocedure) INTO definition;
  IF strpos(definition, '''bar_cost_of_sales'',row.salary,0,''Salary — ''') = 0 THEN
    RAISE EXCEPTION 'Expected payroll salary posting not found';
  END IF;
  definition := replace(definition, '''bar_cost_of_sales'',row.salary,0,''Salary — ''', '''salary_wages'',row.salary,0,''Salary — ''');
  EXECUTE definition;
END;
$migration$;
COMMENT ON FUNCTION public.bar_confirm_payroll_run(uuid,jsonb) IS 'Confirmed salaries debit normal salary_wages; tips retain bar_cost_of_sales. Bank credits, audit, permission and idempotency guards are unchanged.';