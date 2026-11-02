DO $$
DECLARE f text; d text;
BEGIN
  FOREACH f IN ARRAY ARRAY['journal_fee_issued','journal_fee_assessment'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO d FROM pg_proc p WHERE p.proname=f AND p.pronamespace='public'::regnamespace;
    d := replace(d, $q$LIKE 'league fees%'$q$, $q$LIKE '%league fees%'$q$);
    EXECUTE d;
  END LOOP;
END $$;