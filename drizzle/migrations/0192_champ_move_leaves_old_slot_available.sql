DO $fix$
DECLARE
  d text := pg_get_functiondef('public.self_schedule_champ_match(uuid,integer,date,time without time zone,integer,boolean)'::regprocedure);
  restore_block text;
  end_marker text := E'  PERFORM set_config(''app.self_schedule'', ''1'', true);';
BEGIN
  IF position('Restored after match' in d) = 0 THEN RETURN; END IF;
  IF position('  UPDATE public.bookings h' in d) = 0 OR position(end_marker in d) = 0 THEN
    RAISE EXCEPTION 'Unexpected self_schedule_champ_match definition; refusing unsafe replacement';
  END IF;
  restore_block := substring(d from position('  UPDATE public.bookings h' in d) for
    position(end_marker in d) - position('  UPDATE public.bookings h' in d));
  IF restore_block IS NULL OR length(restore_block) < 100 OR position('Restored after match' in restore_block) = 0 THEN
    RAISE EXCEPTION 'Reservation restoration block not found';
  END IF;
  d := replace(d, restore_block, '');
  EXECUTE d;
END
$fix$;