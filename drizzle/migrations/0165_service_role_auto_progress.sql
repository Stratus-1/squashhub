DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.structured_commit(uuid,jsonb)'::regprocedure);
  d := replace(d, 'IF NOT public.can_manage_tournament(auth.uid(), p_tid) THEN',
                  'IF coalesce(auth.role(), '''') <> ''service_role'' AND NOT public.can_manage_tournament(auth.uid(), p_tid) THEN');
  IF position('service_role' in d) = 0 THEN RAISE EXCEPTION 'structured_commit patch failed'; END IF;
  EXECUTE d;

  d := pg_get_functiondef('public.self_schedule_champ_match(uuid,integer,date,time without time zone,integer,boolean)'::regprocedure);
  d := replace(d, 'IF auth.uid() IS NULL THEN', 'IF auth.uid() IS NULL AND coalesce(auth.role(), '''') <> ''service_role'' THEN');
  d := replace(d, '_can_manage := public.is_club_admin_or_permitted(auth.uid(), _club_id, ''champs'');',
                  '_can_manage := coalesce(auth.role(), '''') = ''service_role'' OR public.is_club_admin_or_permitted(auth.uid(), _club_id, ''champs'');');
  IF (length(d) - length(replace(d, 'service_role', ''))) / 12 < 2 THEN RAISE EXCEPTION 'self_schedule patch failed'; END IF;
  EXECUTE d;
END $$;