CREATE OR REPLACE FUNCTION public.promote_all_sportyhq_clubs(_parent_key text DEFAULT NULL, _limit integer DEFAULT 500)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE r record; _count int := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Platform admin only';
  END IF;
  FOR r IN SELECT id FROM public.sportyhq_orgs
           WHERE kind = 'club'
             AND status <> 'ignored'
             AND matched_org_id IS NULL
             AND (_parent_key IS NULL OR parent_key = _parent_key)
           ORDER BY name
           LIMIT GREATEST(_limit, 1) LOOP
    BEGIN
      PERFORM public.promote_sportyhq_org(r.id, NULL, NULL);
      _count := _count + 1;
    EXCEPTION WHEN OTHERS THEN
      -- Skip clubs that clash (duplicate slug/name) and keep going.
      NULL;
    END;
  END LOOP;
  RETURN _count;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.promote_all_sportyhq_clubs(text, integer) TO authenticated;