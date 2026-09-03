-- Counter devices: a club's bar tablet/phone unlocked with a short staff PIN
CREATE TABLE IF NOT EXISTS public.bar_counter_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Bar counter',
  pin_hash text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.bar_counter_devices TO authenticated;
GRANT ALL ON public.bar_counter_devices TO service_role;
ALTER TABLE public.bar_counter_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Bar staff view counter devices"
  ON public.bar_counter_devices FOR SELECT TO authenticated
  USING (public.bar_staff_can_serve(auth.uid(), club_id));

CREATE TABLE IF NOT EXISTS public.bar_counter_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES public.bar_counter_devices(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  revoked_at timestamptz,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.bar_counter_sessions TO service_role;
ALTER TABLE public.bar_counter_sessions ENABLE ROW LEVEL SECURITY;
-- no client policies: sessions are only reachable through the definer functions below

CREATE UNIQUE INDEX IF NOT EXISTS bar_counter_sessions_token_idx ON public.bar_counter_sessions (token);
CREATE INDEX IF NOT EXISTS bar_counter_devices_club_idx ON public.bar_counter_devices (club_id) WHERE active;

-- Admin/bar-permission: set or change the counter PIN
CREATE OR REPLACE FUNCTION public.bar_counter_set_pin(_club_id uuid, _pin text, _label text DEFAULT 'Bar counter')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bar_staff_can_serve(auth.uid(), _club_id) THEN
    RAISE EXCEPTION 'You do not have bar permission for this club';
  END IF;
  IF COALESCE(_pin,'') !~ '^[0-9]{4,8}$' THEN RAISE EXCEPTION 'The counter PIN must be 4 to 8 digits'; END IF;

  SELECT id INTO v_id FROM public.bar_counter_devices WHERE club_id = _club_id AND active LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO public.bar_counter_devices (club_id, label, pin_hash, created_by)
    VALUES (_club_id, COALESCE(NULLIF(btrim(_label),''), 'Bar counter'), crypt(_pin, gen_salt('bf')), auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.bar_counter_devices
       SET pin_hash = crypt(_pin, gen_salt('bf')),
           label = COALESCE(NULLIF(btrim(_label),''), label),
           updated_at = now()
     WHERE id = v_id;
    -- changing the PIN signs out existing counter devices
    UPDATE public.bar_counter_sessions SET revoked_at = now()
     WHERE device_id = v_id AND revoked_at IS NULL;
  END IF;

  RETURN jsonb_build_object('device_id', v_id);
END; $$;

CREATE OR REPLACE FUNCTION public.bar_counter_status(_club_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_dev public.bar_counter_devices%ROWTYPE; v_sessions int;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bar_staff_can_serve(auth.uid(), _club_id) THEN
    RAISE EXCEPTION 'You do not have bar permission for this club';
  END IF;
  SELECT * INTO v_dev FROM public.bar_counter_devices WHERE club_id = _club_id AND active LIMIT 1;
  SELECT count(*) INTO v_sessions FROM public.bar_counter_sessions
   WHERE device_id = v_dev.id AND revoked_at IS NULL AND expires_at > now();
  RETURN jsonb_build_object('has_pin', v_dev.id IS NOT NULL, 'label', v_dev.label, 'unlocked_devices', COALESCE(v_sessions,0));
END; $$;

CREATE OR REPLACE FUNCTION public.bar_counter_revoke_devices(_club_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n int;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bar_staff_can_serve(auth.uid(), _club_id) THEN
    RAISE EXCEPTION 'You do not have bar permission for this club';
  END IF;
  UPDATE public.bar_counter_sessions SET revoked_at = now()
   WHERE club_id = _club_id AND revoked_at IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('revoked', v_n);
END; $$;

-- Unlock a counter device by scanning the club bar QR code and entering the staff PIN
CREATE OR REPLACE FUNCTION public.bar_counter_unlock(_code text, _pin text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_club uuid; v_dev public.bar_counter_devices%ROWTYPE; v_token uuid; v_name text;
BEGIN
  SELECT club_id INTO v_club FROM public.qr_short_codes WHERE code = _code AND active = true;
  IF v_club IS NULL THEN RAISE EXCEPTION 'This bar code is no longer active'; END IF;

  SELECT * INTO v_dev FROM public.bar_counter_devices WHERE club_id = v_club AND active LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Counter mode has not been set up for this club'; END IF;
  IF COALESCE(_pin,'') !~ '^[0-9]{4,8}$' OR v_dev.pin_hash <> crypt(_pin, v_dev.pin_hash) THEN
    PERFORM pg_sleep(0.5);
    RAISE EXCEPTION 'Incorrect counter PIN';
  END IF;

  INSERT INTO public.bar_counter_sessions (device_id, club_id)
  VALUES (v_dev.id, v_club) RETURNING token INTO v_token;

  SELECT name INTO v_name FROM public.clubs WHERE id = v_club;
  RETURN jsonb_build_object('token', v_token, 'club_id', v_club, 'club_name', v_name, 'label', v_dev.label);
END; $$;

-- Resolve the club a caller may act for: either a valid counter token, or signed-in bar staff
CREATE OR REPLACE FUNCTION public.bar_counter_context(_token uuid, _club_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sess public.bar_counter_sessions%ROWTYPE;
BEGIN
  IF _token IS NOT NULL THEN
    SELECT * INTO v_sess FROM public.bar_counter_sessions
     WHERE token = _token AND revoked_at IS NULL AND expires_at > now();
    IF NOT FOUND THEN RAISE EXCEPTION 'This counter device needs to be unlocked again'; END IF;
    UPDATE public.bar_counter_sessions SET last_seen_at = now() WHERE id = v_sess.id;
    RETURN v_sess.club_id;
  END IF;

  IF _club_id IS NOT NULL AND auth.uid() IS NOT NULL AND public.bar_staff_can_serve(auth.uid(), _club_id) THEN
    RETURN _club_id;
  END IF;
  RAISE EXCEPTION 'You do not have bar permission for this club';
END; $$;

-- Everything the counter screen needs: club, menu, open tabs with totals
CREATE OR REPLACE FUNCTION public.bar_counter_board(_token uuid DEFAULT NULL, _club_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_club uuid; v_items jsonb; v_tabs jsonb; v_c public.clubs%ROWTYPE;
BEGIN
  v_club := public.bar_counter_context(_token, _club_id);
  SELECT * INTO v_c FROM public.clubs WHERE id = v_club;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', i.id, 'name', i.name, 'price', i.price, 'category', i.category)
                            ORDER BY i.category NULLS LAST, i.name), '[]'::jsonb)
    INTO v_items FROM public.bar_items i WHERE i.club_id = v_club AND i.active;

  SELECT COALESCE(jsonb_agg(t ORDER BY t->>'opened_at'), '[]'::jsonb) INTO v_tabs
  FROM (
    SELECT jsonb_build_object(
             'tab_id', g.id, 'token', g.token, 'guest_name', g.guest_name,
             'status', g.status, 'opened_at', g.opened_at,
             'total', COALESCE((SELECT sum(s.total) FROM public.bar_visitor_sales s WHERE s.guest_tab_id = g.id), 0),
             'lines', COALESCE((SELECT jsonb_agg(jsonb_build_object('name', b.name, 'quantity', s.quantity, 'total', s.total)
                                                 ORDER BY s.created_at)
                                  FROM public.bar_visitor_sales s
                                  LEFT JOIN public.bar_items b ON b.id = s.bar_item_id
                                 WHERE s.guest_tab_id = g.id), '[]'::jsonb)
           ) AS t
      FROM public.bar_guest_tabs g
     WHERE g.club_id = v_club AND g.status IN ('open','closing')
  ) q;

  RETURN jsonb_build_object(
    'club_id', v_club, 'club_name', v_c.name,
    'cash_enabled', COALESCE(v_c.bar_cash_enabled, false),
    'card_enabled', COALESCE(v_c.bar_card_swipe_enabled, true),
    'items', v_items, 'tabs', v_tabs
  );
END; $$;

CREATE OR REPLACE FUNCTION public.bar_counter_open_tab(_guest_name text, _token uuid DEFAULT NULL, _club_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_club uuid; v_id uuid;
BEGIN
  v_club := public.bar_counter_context(_token, _club_id);
  IF btrim(COALESCE(_guest_name,'')) = '' THEN RAISE EXCEPTION 'Please give a name for the tab'; END IF;
  INSERT INTO public.bar_guest_tabs (club_id, guest_name)
  VALUES (v_club, left(btrim(_guest_name), 80)) RETURNING id INTO v_id;
  RETURN jsonb_build_object('tab_id', v_id);
END; $$;

CREATE OR REPLACE FUNCTION public.bar_counter_add_to_tab(_tab_id uuid, _lines jsonb, _token uuid DEFAULT NULL, _club_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_club uuid; v_tab public.bar_guest_tabs%ROWTYPE;
BEGIN
  v_club := public.bar_counter_context(_token, _club_id);
  SELECT * INTO v_tab FROM public.bar_guest_tabs WHERE id = _tab_id AND club_id = v_club;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tab not found'; END IF;
  IF v_tab.status <> 'open' THEN RAISE EXCEPTION 'This tab has already been settled'; END IF;
  RETURN public.add_to_bar_guest_tab(_tab_id, v_tab.token, _lines);
END; $$;

CREATE OR REPLACE FUNCTION public.bar_counter_settle_tab(_tab_id uuid, _method text, _token uuid DEFAULT NULL, _club_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_club uuid; v_tab public.bar_guest_tabs%ROWTYPE; v_res jsonb;
BEGIN
  v_club := public.bar_counter_context(_token, _club_id);
  SELECT * INTO v_tab FROM public.bar_guest_tabs WHERE id = _tab_id AND club_id = v_club;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tab not found'; END IF;
  IF v_tab.status = 'open' THEN
    v_res := public.settle_bar_guest_tab(_tab_id, v_tab.token, _method);
  END IF;
  -- counter staff physically took the payment, so close it off
  UPDATE public.bar_visitor_sales
     SET payment_status = 'paid'
   WHERE guest_tab_id = _tab_id AND payment_status IN ('awaiting_cash','awaiting_terminal');
  UPDATE public.bar_guest_tabs
     SET status = 'settled', closed_at = COALESCE(closed_at, now()), settled_method = COALESCE(settled_method, _method)
   WHERE id = _tab_id;
  RETURN jsonb_build_object('tab_id', _tab_id, 'status', 'settled');
END; $$;

REVOKE ALL ON FUNCTION public.bar_counter_context(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bar_counter_set_pin(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bar_counter_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bar_counter_revoke_devices(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bar_counter_unlock(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bar_counter_board(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bar_counter_open_tab(text, uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bar_counter_add_to_tab(uuid, jsonb, uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bar_counter_settle_tab(uuid, text, uuid, uuid) TO anon, authenticated;