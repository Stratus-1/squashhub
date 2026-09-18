ALTER TABLE public.bar_guest_tabs ADD COLUMN IF NOT EXISTS counter_device_id uuid REFERENCES public.bar_counter_devices(id) ON DELETE SET NULL;
ALTER TABLE public.bar_visitor_sales ADD COLUMN IF NOT EXISTS counter_device_id uuid REFERENCES public.bar_counter_devices(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS bar_visitor_sales_counter_device_idx ON public.bar_visitor_sales(counter_device_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bar_guest_tabs TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bar_visitor_sales TO authenticated;
GRANT SELECT ON public.bar_counter_devices TO authenticated;
GRANT ALL ON public.bar_guest_tabs TO service_role;
GRANT ALL ON public.bar_visitor_sales TO service_role;
GRANT ALL ON public.bar_counter_devices TO service_role;

-- list all counter operators for a club
CREATE OR REPLACE FUNCTION public.bar_counter_operators(_club_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bar_staff_can_serve(auth.uid(), _club_id) THEN
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

-- add or update one named operator PIN (max 10 active per club)
CREATE OR REPLACE FUNCTION public.bar_counter_set_pin(_club_id uuid, _pin text, _label text DEFAULT 'Bar counter'::text, _device_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_id uuid; v_count int; v_label text; v_clash uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bar_staff_can_serve(auth.uid(), _club_id) THEN
    RAISE EXCEPTION 'You do not have bar permission for this club';
  END IF;
  IF COALESCE(_pin,'') !~ '^[0-9]{4,8}$' THEN RAISE EXCEPTION 'The counter PIN must be 4 to 8 digits'; END IF;
  v_label := COALESCE(NULLIF(btrim(_label),''), 'Bar counter');

  -- the PIN identifies the person, so it must be unique among this club's operators
  SELECT d.id INTO v_clash FROM public.bar_counter_devices d
   WHERE d.club_id = _club_id AND d.active AND d.pin_hash = crypt(_pin, d.pin_hash)
     AND (_device_id IS NULL OR d.id <> _device_id)
   LIMIT 1;
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
    VALUES (_club_id, v_label, crypt(_pin, gen_salt('bf')), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.bar_counter_devices
       SET pin_hash = crypt(_pin, gen_salt('bf')), label = v_label, updated_at = now()
     WHERE id = v_id;
    UPDATE public.bar_counter_sessions SET revoked_at = now()
     WHERE device_id = v_id AND revoked_at IS NULL;
  END IF;

  RETURN jsonb_build_object('device_id', v_id, 'label', v_label);
END; $function$;

-- remove one operator (and sign their devices out)
CREATE OR REPLACE FUNCTION public.bar_counter_remove_operator(_club_id uuid, _device_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR NOT public.bar_staff_can_serve(auth.uid(), _club_id) THEN
    RAISE EXCEPTION 'You do not have bar permission for this club';
  END IF;
  UPDATE public.bar_counter_devices SET active = false, updated_at = now()
   WHERE id = _device_id AND club_id = _club_id;
  UPDATE public.bar_counter_sessions SET revoked_at = now()
   WHERE device_id = _device_id AND revoked_at IS NULL;
  RETURN jsonb_build_object('removed', _device_id);
END; $function$;

-- unlock: match the PIN against any of the club's operators
CREATE OR REPLACE FUNCTION public.bar_counter_unlock(_code text, _pin text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
DECLARE v_club uuid; v_dev public.bar_counter_devices%ROWTYPE; v_token uuid; v_name text;
BEGIN
  SELECT club_id INTO v_club FROM public.qr_short_codes WHERE code = _code AND active = true;
  IF v_club IS NULL THEN RAISE EXCEPTION 'This bar code is no longer active'; END IF;
  IF COALESCE(_pin,'') !~ '^[0-9]{4,8}$' THEN
    PERFORM pg_sleep(0.5); RAISE EXCEPTION 'Incorrect counter PIN';
  END IF;

  SELECT * INTO v_dev FROM public.bar_counter_devices d
   WHERE d.club_id = v_club AND d.active AND d.pin_hash = crypt(_pin, d.pin_hash)
   LIMIT 1;
  IF NOT FOUND THEN
    PERFORM pg_sleep(0.5); RAISE EXCEPTION 'Incorrect counter PIN';
  END IF;

  INSERT INTO public.bar_counter_sessions (device_id, club_id)
  VALUES (v_dev.id, v_club) RETURNING token INTO v_token;

  SELECT name INTO v_name FROM public.clubs WHERE id = v_club;
  RETURN jsonb_build_object('token', v_token, 'club_id', v_club, 'club_name', v_name,
                            'label', v_dev.label, 'device_id', v_dev.id);
END; $function$;

-- which operator is behind this unlocked device (null for signed-in staff)
CREATE OR REPLACE FUNCTION public.bar_counter_device_for_token(_token uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT device_id FROM public.bar_counter_sessions
   WHERE token = _token AND revoked_at IS NULL AND expires_at > now()
   LIMIT 1;
$function$;

-- stamp the operator on new tabs
CREATE OR REPLACE FUNCTION public.bar_counter_open_tab(_guest_name text, _token uuid DEFAULT NULL::uuid, _club_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_club uuid; v_id uuid; v_dev uuid;
BEGIN
  v_club := public.bar_counter_context(_token, _club_id);
  IF btrim(COALESCE(_guest_name,'')) = '' THEN RAISE EXCEPTION 'Please give a name for the tab'; END IF;
  v_dev := public.bar_counter_device_for_token(_token);
  INSERT INTO public.bar_guest_tabs (club_id, guest_name, counter_device_id)
  VALUES (v_club, left(btrim(_guest_name), 80), v_dev) RETURNING id INTO v_id;
  RETURN jsonb_build_object('tab_id', v_id);
END; $function$;

-- stamp the operator on the sales added to a tab
CREATE OR REPLACE FUNCTION public.bar_counter_add_to_tab(_tab_id uuid, _lines jsonb, _token uuid DEFAULT NULL::uuid, _club_id uuid DEFAULT NULL::uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_club uuid; v_tab public.bar_guest_tabs%ROWTYPE; v_dev uuid; v_res jsonb;
BEGIN
  v_club := public.bar_counter_context(_token, _club_id);
  SELECT * INTO v_tab FROM public.bar_guest_tabs WHERE id = _tab_id AND club_id = v_club;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tab not found'; END IF;
  IF v_tab.status <> 'open' THEN RAISE EXCEPTION 'This tab has already been settled'; END IF;
  v_dev := COALESCE(public.bar_counter_device_for_token(_token), v_tab.counter_device_id);
  v_res := public.add_to_bar_guest_tab(_tab_id, v_tab.token, _lines);
  IF v_dev IS NOT NULL THEN
    UPDATE public.bar_visitor_sales SET counter_device_id = v_dev
     WHERE guest_tab_id = _tab_id AND counter_device_id IS NULL;
  END IF;
  RETURN v_res;
END; $function$;