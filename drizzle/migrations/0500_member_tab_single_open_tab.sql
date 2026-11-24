CREATE OR REPLACE FUNCTION public.bar_counter_open_tab(_guest_name text, _token uuid DEFAULT NULL::uuid, _club_id uuid DEFAULT NULL::uuid, _guest_phone text DEFAULT NULL::text, _operator text DEFAULT NULL::text, _club_member_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_club uuid; v_id uuid; v_dev uuid; v_name text; v_member public.club_members%ROWTYPE;
BEGIN
  v_club := public.bar_counter_context(_token, _club_id);
  SELECT d.id, d.label INTO v_dev, v_name FROM public.bar_counter_sessions s
    JOIN public.bar_counter_devices d ON d.id = s.device_id AND d.club_id = s.club_id
   WHERE s.token = _token AND s.club_id = v_club AND s.revoked_at IS NULL AND s.expires_at > now() AND d.active;
  IF v_dev IS NULL OR nullif(btrim(v_name), '') IS NULL THEN RAISE EXCEPTION 'Unlock counter with your personal PIN again'; END IF;
  IF _club_member_id IS NOT NULL THEN
    SELECT * INTO v_member FROM public.club_members WHERE id = _club_member_id AND club_id = v_club FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Member not found at this club'; END IF;
    IF COALESCE(v_member.status, 'active') <> 'active' THEN RAISE EXCEPTION 'This membership is not active'; END IF;
    IF COALESCE(v_member.role::text, 'member') = 'visitor' THEN RAISE EXCEPTION 'That person is a visitor — open a visitor tab instead'; END IF;
    SELECT id INTO v_id FROM public.bar_guest_tabs
     WHERE club_id = v_club AND club_member_id = v_member.id AND status IN ('open','closing')
     ORDER BY opened_at ASC LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN jsonb_build_object('tab_id', v_id, 'member', true, 'existing', true); END IF;
    INSERT INTO public.bar_guest_tabs (club_id, guest_name, guest_phone, counter_device_id, operator_name, club_member_id, opened_source)
    VALUES (v_club, left(v_member.name, 80), nullif(left(coalesce(v_member.phone, ''), 30), ''), v_dev, v_name, v_member.id, 'counter_member')
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('tab_id', v_id, 'member', true);
  END IF;
  IF btrim(coalesce(_guest_name, '')) = '' THEN RAISE EXCEPTION 'Please give a name for the tab'; END IF;
  IF btrim(coalesce(_guest_phone, '')) = '' THEN RAISE EXCEPTION 'Enter the visitor''s cell number'; END IF;
  INSERT INTO public.bar_guest_tabs (club_id, guest_name, guest_phone, counter_device_id, operator_name)
  VALUES (v_club, left(btrim(_guest_name), 80), left(btrim(_guest_phone), 30), v_dev, v_name) RETURNING id INTO v_id;
  RETURN jsonb_build_object('tab_id', v_id);
END; $function$;

CREATE OR REPLACE FUNCTION public.open_bar_guest_tab(_code text, _guest_name text, _guest_phone text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_club uuid; v_member uuid; v_id uuid; v_token uuid; v_gname text;
BEGIN
  SELECT club_id INTO v_club FROM public.qr_short_codes WHERE code = _code AND active = true;
  IF v_club IS NULL THEN RAISE EXCEPTION 'This bar code is no longer active'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clubs WHERE id = v_club AND COALESCE(honesty_bar_enabled,false)) THEN RAISE EXCEPTION 'The bar is not open for orders'; END IF;
  IF btrim(COALESCE(_guest_name,'')) = '' THEN RAISE EXCEPTION 'Please give a name for the tab'; END IF;
  IF auth.uid() IS NOT NULL THEN
    SELECT id INTO v_member FROM public.club_members WHERE club_id = v_club AND user_id = auth.uid() LIMIT 1;
  END IF;
  IF v_member IS NOT NULL THEN
    SELECT id, token, guest_name INTO v_id, v_token, v_gname FROM public.bar_guest_tabs
     WHERE club_id = v_club AND club_member_id = v_member AND status IN ('open','closing')
     ORDER BY opened_at ASC LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN jsonb_build_object('tab_id', v_id, 'token', v_token, 'guest_name', v_gname); END IF;
  END IF;
  INSERT INTO public.bar_guest_tabs (club_id, guest_name, guest_phone, club_member_id)
  VALUES (v_club, btrim(_guest_name), NULLIF(btrim(COALESCE(_guest_phone,'')),''), v_member)
  RETURNING id, token INTO v_id, v_token;
  RETURN jsonb_build_object('tab_id', v_id, 'token', v_token, 'guest_name', btrim(_guest_name));
END; $function$;

CREATE OR REPLACE FUNCTION public.open_bar_guest_tab(_code text, _guest_name text)
 RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$ SELECT public.open_bar_guest_tab(_code, _guest_name, NULL::text) $function$;