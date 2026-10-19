CREATE OR REPLACE FUNCTION public.bar_counter_search_members(_query text, _token uuid DEFAULT NULL::uuid, _club_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_club uuid; v_dev uuid; v_name text; v_q text;
BEGIN
  v_club := public.bar_counter_context(_token, _club_id);
  SELECT d.id, d.label INTO v_dev, v_name
    FROM public.bar_counter_sessions s
    JOIN public.bar_counter_devices d ON d.id = s.device_id AND d.club_id = s.club_id
   WHERE s.token = _token AND s.club_id = v_club AND s.revoked_at IS NULL
     AND s.expires_at > now() AND d.active;
  IF v_dev IS NULL OR nullif(btrim(v_name), '') IS NULL THEN
    RAISE EXCEPTION 'Unlock counter with your personal PIN again';
  END IF;
  v_q := btrim(coalesce(_query, ''));
  IF length(v_q) < 2 THEN RETURN '[]'::jsonb; END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'id', m.id, 'display_name', m.name, 'member_number', m.club_member_number)
           ORDER BY m.name)
    FROM (
      SELECT m.id, m.name, m.club_member_number
        FROM public.club_members m
       WHERE m.club_id = v_club
         AND COALESCE(m.status, 'active') = 'active'
         AND COALESCE(m.role::text, 'member') <> 'visitor'
         AND (m.name ILIKE '%' || v_q || '%' OR m.club_member_number::text ILIKE '%' || v_q || '%')
       ORDER BY m.name
       LIMIT 12
    ) m
  ), '[]'::jsonb);
END;
$function$;