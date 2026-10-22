DO $migration$
DECLARE fn text;
BEGIN
  SELECT pg_get_functiondef('public.bar_cash_up_close_v2(uuid,timestamptz,jsonb,numeric,numeric,boolean,text,uuid,uuid)'::regprocedure) INTO fn;
  IF position('amt := round(coalesce((p->>''amount'')::numeric,0),2);' IN fn) = 0 THEN
    RAISE EXCEPTION 'Cash-up payout validation location not found';
  END IF;
  fn := replace(fn, 'amt := round(coalesce((p->>''amount'')::numeric,0),2);', 'amt := (p->>''amount'')::numeric;
    IF amt IS NULL OR amt::text IN (''NaN'',''Infinity'',''-Infinity'') OR amt < 0 OR amt <> round(amt,2) THEN
      RAISE EXCEPTION ''Tips paid out must be positive amounts; use zero for no payout'';
    END IF;');
  EXECUTE fn;
END
$migration$;