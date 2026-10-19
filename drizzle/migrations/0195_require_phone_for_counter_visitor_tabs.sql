CREATE OR REPLACE FUNCTION public.bar_counter_open_tab(_guest_name text, _token uuid DEFAULT NULL::uuid, _club_id uuid DEFAULT NULL::uuid, _guest_phone text DEFAULT NULL::text, _operator text DEFAULT NULL::text, _club_member_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_club uuid; v_id uuid; v_dev uuid; v_name text; v_member public.club_members%ROWTYPE;
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

  IF _club_member_id IS NOT NULL THEN
    SELECT * INTO v_member FROM public.club_members
     WHERE id = _club_member_id AND club_id = v_club;
    IF NOT FOUND THEN RAISE EXCEPTION 'Member not found at this club'; END IF;
    IF COALESCE(v_member.status, 'active') <> 'active' THEN
      RAISE EXCEPTION 'This membership is not active';
    END IF;
    IF COALESCE(v_member.role::text, 'member') = 'visitor' THEN
      RAISE EXCEPTION 'That person is a visitor — open a visitor tab instead';
    END IF;
    INSERT INTO public.bar_guest_tabs
      (club_id, guest_name, guest_phone, counter_device_id, operator_name, club_member_id, opened_source)
    VALUES
      (v_club, left(v_member.name, 80), nullif(left(coalesce(v_member.phone, ''), 30), ''),
       v_dev, v_name, v_member.id, 'counter_member')
    RETURNING id INTO v_id;
  ELSE
    IF btrim(coalesce(_guest_name, '')) = '' THEN RAISE EXCEPTION 'Please give a name for the tab'; END IF;
    IF btrim(coalesce(_guest_phone, '')) = '' THEN RAISE EXCEPTION 'Enter the visitor''s cell number'; END IF;
    INSERT INTO public.bar_guest_tabs
      (club_id, guest_name, guest_phone, counter_device_id, operator_name, opened_source)
    VALUES
      (v_club, left(btrim(_guest_name), 80), left(btrim(_guest_phone), 30), v_dev, v_name, 'counter')
    RETURNING id INTO v_id;
  END IF;
  RETURN jsonb_build_object('tab_id', v_id);
END;
$function$;