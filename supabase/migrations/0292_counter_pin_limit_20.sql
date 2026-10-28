CREATE OR REPLACE FUNCTION public.bar_counter_set_pin(_club_id uuid, _pin text, _label text DEFAULT 'Bar counter'::text, _device_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
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
    IF v_count >= 20 THEN RAISE EXCEPTION 'A club can have at most 20 counter PINs — remove one first'; END IF;
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
END; $function$
;
