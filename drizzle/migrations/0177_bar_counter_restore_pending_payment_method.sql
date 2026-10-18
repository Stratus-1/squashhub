DO $fix$
DECLARE
  definition text := pg_get_functiondef('public.bar_counter_board(uuid,uuid)'::regprocedure);
  anchor text := '''operator'', g.operator_name,';
BEGIN
  IF position('''settled_method'', g.settled_method' in definition) > 0 THEN
    RETURN;
  END IF;
  IF position(anchor in definition) = 0 THEN
    RAISE EXCEPTION 'Unexpected counter board definition; refusing replacement';
  END IF;
  EXECUTE replace(definition, anchor, anchor || E'\n             ''settled_method'', g.settled_method,');
END
$fix$;