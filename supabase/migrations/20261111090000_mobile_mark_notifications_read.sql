-- Keep Player notification reads authoritative in the existing web-owned table.
-- The Player API calls this through the same Lovable RPC bridge used by its
-- other mobile reads; no parallel notification store is introduced.
CREATE OR REPLACE FUNCTION public.mobile_mark_notifications_read(
  p_sync_secret text,
  p_club_id uuid,
  p_member_id uuid,
  p_notification_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_member public.club_members%ROWTYPE;
  v_ids uuid[];
  v_count integer := 0;
BEGIN
  IF NOT public.mobile_internal_secret_ok(p_sync_secret) THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_member
  FROM public.club_members
  WHERE id = p_member_id AND club_id = p_club_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Player membership does not belong to this club' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT id), ARRAY[]::uuid[])
  INTO v_ids
  FROM unnest(COALESCE(p_notification_ids, ARRAY[]::uuid[])) AS input(id);

  IF cardinality(v_ids) > 100 THEN
    RAISE EXCEPTION 'A maximum of 100 notifications can be marked at once' USING ERRCODE = '22023';
  END IF;

  WITH eligible AS (
    SELECT n.id
    FROM public.notifications n
    WHERE n.id = ANY(v_ids)
      AND (
        n.club_member_id = p_member_id
        OR (v_member.user_id IS NOT NULL AND n.user_id = v_member.user_id)
        OR (
          v_member.user_id IS NOT NULL
          AND n.club_member_id IN (
            SELECT linked.id
            FROM public.club_members linked
            WHERE linked.user_id = v_member.user_id
          )
        )
      )
  ), updated AS (
    UPDATE public.notifications n
    SET read = true
    FROM eligible e
    WHERE n.id = e.id
    RETURNING n.id
  )
  SELECT count(*)::integer INTO v_count FROM updated;

  RETURN jsonb_build_object('ok', true, 'count', v_count);
END;
$function$;

REVOKE ALL ON FUNCTION public.mobile_mark_notifications_read(text, uuid, uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mobile_mark_notifications_read(text, uuid, uuid, uuid[]) TO anon, authenticated, service_role;
