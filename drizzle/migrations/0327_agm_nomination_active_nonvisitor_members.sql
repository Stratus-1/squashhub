DO $migration$
DECLARE definition text;
BEGIN
  definition := pg_get_functiondef('public.agm_open_nominations(uuid,uuid[],timestamptz)'::regprocedure);
  IF position('cm.status = ''active''' in definition) = 0 THEN RAISE EXCEPTION 'Unexpected nomination opening definition'; END IF;
  definition := replace(definition, 'cm.status = ''active''', 'cm.status = ''active'' AND cm.role IN (''member'',''admin'',''captain'') AND cm.suspension_status IN (''active'',''warning'')');
  EXECUTE definition;

  definition := pg_get_functiondef('public.agm_add_nomination_recipients(uuid,uuid[])'::regprocedure);
  IF position('cm.status=''active''' in definition) = 0 THEN RAISE EXCEPTION 'Unexpected nomination recipient definition'; END IF;
  definition := replace(definition, 'cm.status=''active''', 'cm.status=''active'' AND cm.role IN (''member'',''admin'',''captain'')');
  EXECUTE definition;

  definition := pg_get_functiondef('public.agm_voter_candidates(uuid)'::regprocedure);
  IF position('cm.status = ''active''' in definition) = 0 THEN RAISE EXCEPTION 'Unexpected candidate definition'; END IF;
  definition := replace(definition, 'cm.status = ''active''', 'cm.status = ''active'' AND cm.suspension_status IN (''active'',''warning'')');
  EXECUTE definition;
END
$migration$;