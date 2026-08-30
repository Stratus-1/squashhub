CREATE OR REPLACE FUNCTION public.promote_all_sportyhq_org_members(_org_id uuid DEFAULT NULL, _limit integer DEFAULT 500)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _r record;
  _n integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Platform admin only';
  END IF;

  FOR _r IN
    SELECT sm.id
    FROM public.sportyhq_org_members sm
    JOIN public.sportyhq_orgs o ON o.id = sm.org_id
    WHERE sm.status IN ('new', 'matched')
      AND (_org_id IS NULL OR sm.org_id = _org_id)
      AND o.status = 'promoted'
    ORDER BY sm.created_at
    LIMIT _limit
  LOOP
    BEGIN
      PERFORM public.promote_sportyhq_org_member(_r.id);
      _n := _n + 1;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;
  END LOOP;

  RETURN _n;
END;
$$;

GRANT EXECUTE ON FUNCTION public.promote_all_sportyhq_org_members(uuid, integer) TO authenticated;