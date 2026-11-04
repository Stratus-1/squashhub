ALTER FUNCTION public.mobile_player_home_payload(text, uuid, uuid, date, date) RENAME TO mobile_player_home_payload_base;

CREATE OR REPLACE FUNCTION public.mobile_player_home_payload(
  p_sync_secret text,
  p_club_id uuid,
  p_member_id uuid,
  p_from date DEFAULT CURRENT_DATE,
  p_to date DEFAULT CURRENT_DATE + 7
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_member public.club_members%ROWTYPE;
  v_payload jsonb;
  v_notifications jsonb;
BEGIN
  v_payload := public.mobile_player_home_payload_base(p_sync_secret, p_club_id, p_member_id, p_from, p_to);
  SELECT * INTO v_member FROM public.club_members WHERE id = p_member_id AND club_id = p_club_id LIMIT 1;
  SELECT COALESCE(jsonb_agg(to_jsonb(notification_row) ORDER BY notification_row.created_at DESC), '[]'::jsonb)
  INTO v_notifications
  FROM (
    SELECT n.id, n.type, n.title, n.message, n.read, n.created_at, n.url
    FROM public.notifications n
    WHERE n.club_member_id = p_member_id
       OR (
         v_member.user_id IS NOT NULL
         AND (
           n.user_id = v_member.user_id
           OR n.club_member_id IN (
             SELECT linked.id FROM public.club_members linked WHERE linked.user_id = v_member.user_id
           )
         )
       )
    ORDER BY n.created_at DESC
    LIMIT 100
  ) notification_row;
  RETURN jsonb_set(v_payload, '{notifications}', v_notifications, true);
END;
$$;

REVOKE ALL ON FUNCTION public.mobile_player_home_payload(text, uuid, uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mobile_player_home_payload(text, uuid, uuid, date, date) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.mobile_player_home_payload_base(text, uuid, uuid, date, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mobile_player_home_payload_base(text, uuid, uuid, date, date) TO service_role;