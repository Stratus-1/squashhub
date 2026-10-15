CREATE OR REPLACE FUNCTION public.bar_can_manage_pins(_user_id uuid, _club_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT _user_id IS NOT NULL AND (
    COALESCE(public.is_platform_admin(_user_id), false)
    OR CASE WHEN public.club_new_perms_on(_club_id)
         THEN public.has_cap(_user_id, _club_id, 'bar.pin.manage')
         ELSE public.bar_staff_can_serve(_user_id, _club_id) END)
$$;
REVOKE ALL ON FUNCTION public.bar_can_manage_pins(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bar_can_manage_pins(uuid, uuid) TO authenticated;

INSERT INTO public.role_capability_templates (club_id, role_name, capability_key)
SELECT NULL, r, c FROM (VALUES ('Treasurer'),('Bar Manager')) v(r), (VALUES ('bar.pin.manage'),('bar.devices')) w(c)
WHERE NOT EXISTS (SELECT 1 FROM public.role_capability_templates t WHERE t.club_id IS NULL AND t.role_name = v.r AND t.capability_key = w.c);

CREATE OR REPLACE FUNCTION public.bar_counter_set_pin(_club_id uuid, _pin text, _label text DEFAULT 'Bar counter'::text, _device_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_id uuid; v_count int; v_label text; v_clash uuid; v_new boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  v_new := public.club_new_perms_on(_club_id);
  IF NOT public.bar_can_manage_pins(auth.uid(), _club_id) THEN
    RAISE EXCEPTION 'You do not have permission to manage counter PINs for this club';
  END IF;
  IF COALESCE(_pin,'') !~ '^[0-9]{4,8}$' THEN RAISE EXCEPTION 'The counter PIN must be 4 to 8 digits'; END IF;
  v_label := COALESCE(NULLIF(btrim(_label),''), 'Bar counter');
  SELECT d.id INTO v_clash FROM public.bar_counter_devices d
   WHERE d.club_id = _club_id AND d.active AND d.pin_hash = crypt(_pin, d.pin_hash)
     AND (_device_id IS NULL OR d.id <> _device_id) LIMIT 1;
  IF v_clash IS NOT NULL THEN
    RAISE EXCEPTION 'Another counter person already uses that PIN — please pick a different one';
  END IF;
  IF _device_id IS NOT NULL THEN
    SELECT id INTO v_id FROM public.bar_counter_devices WHERE id = _device_id AND club_id = _club_id AND active;
    IF v_id IS NULL THEN RAISE EXCEPTION 'That counter person no longer exists'; END IF;
  END IF;
  IF v_id IS NULL THEN
    SELECT count(*) INTO v_count FROM public.bar_counter_devices WHERE club_id = _club_id AND active;
    IF v_count >= 10 THEN RAISE EXCEPTION 'A club can have at most 10 counter PINs — remove one first'; END IF;
    INSERT INTO public.bar_counter_devices (club_id, label, pin_hash, created_by)
    VALUES (_club_id, v_label, crypt(_pin, gen_salt('bf')), auth.uid()) RETURNING id INTO v_id;
  ELSE
    UPDATE public.bar_counter_devices SET pin_hash = crypt(_pin, gen_salt('bf')), label = v_label, updated_at = now() WHERE id = v_id;
    UPDATE public.bar_counter_sessions SET revoked_at = now() WHERE device_id = v_id AND revoked_at IS NULL;
  END IF;
  IF v_new THEN
    INSERT INTO public.permission_events (club_id, actor_user_id, event_type, capability_key, detail)
    VALUES (_club_id, auth.uid(), CASE WHEN _device_id IS NULL THEN 'counter_pin_created' ELSE 'counter_pin_reset' END,
            'bar.pin.manage', jsonb_build_object('device_id', v_id, 'label', v_label));
  END IF;
  RETURN jsonb_build_object('device_id', v_id, 'label', v_label);
END; $function$;

CREATE OR REPLACE FUNCTION public.bar_counter_remove_operator(_club_id uuid, _device_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.bar_can_manage_pins(auth.uid(), _club_id) THEN
    RAISE EXCEPTION 'You do not have permission to manage counter PINs for this club';
  END IF;
  UPDATE public.bar_counter_devices SET active = false, updated_at = now() WHERE id = _device_id AND club_id = _club_id;
  UPDATE public.bar_counter_sessions SET revoked_at = now() WHERE device_id = _device_id AND revoked_at IS NULL;
  RETURN jsonb_build_object('removed', _device_id);
END; $function$;

CREATE OR REPLACE FUNCTION public.bar_counter_revoke_devices(_club_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_n int;
BEGIN
  IF NOT public.bar_can_manage_pins(auth.uid(), _club_id) THEN
    RAISE EXCEPTION 'You do not have permission to manage counter devices for this club';
  END IF;
  UPDATE public.bar_counter_sessions SET revoked_at = now() WHERE club_id = _club_id AND revoked_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('revoked', v_n);
END; $function$;

CREATE OR REPLACE FUNCTION public.bar_counter_operators(_club_id uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT (public.bar_staff_can_serve(auth.uid(), _club_id) OR public.bar_can_manage_pins(auth.uid(), _club_id)) THEN
    RAISE EXCEPTION 'You do not have bar permission for this club';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', d.id, 'label', d.label, 'updated_at', d.updated_at,
           'unlocked', (SELECT count(*) FROM public.bar_counter_sessions s
                         WHERE s.device_id = d.id AND s.revoked_at IS NULL AND s.expires_at > now())
         ) ORDER BY d.label), '[]'::jsonb)
    INTO v FROM public.bar_counter_devices d WHERE d.club_id = _club_id AND d.active;
  RETURN v;
END; $function$;