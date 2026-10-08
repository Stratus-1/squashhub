ALTER TABLE public.club_permission_settings ADD COLUMN IF NOT EXISTS shadow_mode boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.new_model_cap(_user_id uuid, _club_id uuid, _capability text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE((
    SELECT bool_and(o.effect = 'grant')
    FROM public.member_capability_overrides o
    JOIN public.club_members m ON m.id = o.club_member_id
    WHERE o.club_id = _club_id AND m.user_id = _user_id
      AND o.capability_key = _capability AND o.revoked_at IS NULL
    HAVING count(*) > 0), false)
$$;
REVOKE ALL ON FUNCTION public.new_model_cap(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.new_model_cap(uuid, uuid, text) TO authenticated, service_role;

-- Read-only comparison: writes only to permission_shadow_log, never changes access.
CREATE OR REPLACE FUNCTION public.run_permission_shadow(_club_id uuid)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _run uuid := gen_random_uuid(); _checked int := 0; _diff int := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  IF NOT COALESCE((SELECT shadow_mode FROM public.club_permission_settings WHERE club_id = _club_id), false) THEN
    RAISE EXCEPTION 'Shadow mode is not enabled for this club';
  END IF;
  WITH pairs AS (
    SELECT DISTINCT m.user_id, c.key,
      public.is_club_admin(m.user_id, _club_id) AS legacy,
      public.new_model_cap(m.user_id, _club_id, c.key) AS nw
    FROM public.club_members m CROSS JOIN public.capability_catalogue c
    WHERE m.club_id = _club_id AND m.user_id IS NOT NULL
  ), ins AS (
    INSERT INTO public.permission_shadow_log(club_id, user_id, capability_key, legacy_answer, new_answer, context)
    SELECT _club_id, user_id, key, legacy, nw, jsonb_build_object('run_id', _run, 'source', 'shadow_sweep')
    FROM pairs WHERE legacy IS DISTINCT FROM nw RETURNING 1
  )
  SELECT (SELECT count(*) FROM pairs), (SELECT count(*) FROM ins) INTO _checked, _diff;
  RETURN jsonb_build_object('run_id', _run, 'checked', _checked, 'differences', _diff);
END $$;
REVOKE ALL ON FUNCTION public.run_permission_shadow(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.run_permission_shadow(uuid) TO authenticated, service_role;