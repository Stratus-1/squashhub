
-- ============ Bar PIN storage (never readable by clients) ============
CREATE TABLE IF NOT EXISTS public.member_bar_pins (
  club_member_id uuid PRIMARY KEY REFERENCES public.club_members(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  pin_hash text NOT NULL,
  failed_attempts int NOT NULL DEFAULT 0,
  locked_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.member_bar_pins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_bar_pins FROM anon, authenticated;
GRANT ALL ON public.member_bar_pins TO service_role;

CREATE TABLE IF NOT EXISTS public.member_bar_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  purpose text NOT NULL DEFAULT 'bar_charge',
  attempts int NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_member_bar_otps_member ON public.member_bar_otps(club_member_id, created_at DESC);
ALTER TABLE public.member_bar_otps ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.member_bar_otps FROM anon, authenticated;
GRANT ALL ON public.member_bar_otps TO service_role;

-- ============ Sale provenance / verification metadata ============
ALTER TABLE public.bar_tab_entries
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'app',
  ADD COLUMN IF NOT EXISTS operator_member_id uuid REFERENCES public.club_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verification_method text,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS signature text;

ALTER TABLE public.bar_visitor_sales
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'qr',
  ADD COLUMN IF NOT EXISTS operator_member_id uuid REFERENCES public.club_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS customer_type text NOT NULL DEFAULT 'visitor',
  ADD COLUMN IF NOT EXISTS visitor_phone text,
  ADD COLUMN IF NOT EXISTS signature text;

-- ============ Helpers ============
CREATE OR REPLACE FUNCTION public.bar_staff_can_serve(_user_id uuid, _club_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(public.is_club_admin_or_permitted(_user_id, _club_id, 'bar'), false);
$$;

-- Set / change my own Bar PIN. Requires the current PIN when one exists,
-- unless a valid one-time code is supplied instead.
CREATE OR REPLACE FUNCTION public.set_my_bar_pin(
  _club_member_id uuid,
  _pin text,
  _current_pin text DEFAULT NULL,
  _otp text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_member public.club_members%ROWTYPE;
  v_existing public.member_bar_pins%ROWTYPE;
  v_otp public.member_bar_otps%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in'; END IF;
  SELECT * INTO v_member FROM public.club_members WHERE id = _club_member_id;
  IF NOT FOUND OR v_member.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'You can only change your own Bar PIN';
  END IF;
  IF _pin !~ '^[0-9]{6}$' THEN RAISE EXCEPTION 'Your Bar PIN must be six digits'; END IF;
  IF _pin IN ('000000','111111','123456','654321') THEN
    RAISE EXCEPTION 'Please choose a less obvious PIN';
  END IF;

  SELECT * INTO v_existing FROM public.member_bar_pins WHERE club_member_id = _club_member_id;
  IF FOUND THEN
    IF _otp IS NOT NULL THEN
      SELECT * INTO v_otp FROM public.member_bar_otps
       WHERE club_member_id = _club_member_id AND consumed_at IS NULL AND expires_at > now()
       ORDER BY created_at DESC LIMIT 1;
      IF NOT FOUND OR v_otp.code_hash <> crypt(_otp, v_otp.code_hash) THEN
        RAISE EXCEPTION 'That verification code is not valid';
      END IF;
      UPDATE public.member_bar_otps SET consumed_at = now() WHERE id = v_otp.id;
    ELSIF _current_pin IS NULL OR v_existing.pin_hash <> crypt(_current_pin, v_existing.pin_hash) THEN
      RAISE EXCEPTION 'Your current Bar PIN is not correct';
    END IF;
  END IF;

  INSERT INTO public.member_bar_pins (club_member_id, club_id, pin_hash, failed_attempts, locked_until, updated_at)
  VALUES (_club_member_id, v_member.club_id, crypt(_pin, gen_salt('bf')), 0, NULL, now())
  ON CONFLICT (club_member_id) DO UPDATE
    SET pin_hash = EXCLUDED.pin_hash, failed_attempts = 0, locked_until = NULL, updated_at = now();

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_bar_pin_status(_club_member_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_member public.club_members%ROWTYPE;
  v_row public.member_bar_pins%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in'; END IF;
  SELECT * INTO v_member FROM public.club_members WHERE id = _club_member_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF v_member.user_id IS DISTINCT FROM auth.uid()
     AND NOT public.bar_staff_can_serve(auth.uid(), v_member.club_id) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;
  SELECT * INTO v_row FROM public.member_bar_pins WHERE club_member_id = _club_member_id;
  RETURN jsonb_build_object(
    'has_pin', FOUND,
    'locked', COALESCE(v_row.locked_until > now(), false),
    'locked_until', v_row.locked_until,
    'has_phone', COALESCE(btrim(v_member.phone), '') <> ''
  );
END;
$$;

-- Staff member search, scoped hard to the staff member's own club.
CREATE OR REPLACE FUNCTION public.bar_search_members(_club_id uuid, _q text)
RETURNS TABLE (id uuid, name text, club_member_number text, phone_hint text, has_pin boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_q text := btrim(COALESCE(_q, ''));
BEGIN
  IF auth.uid() IS NULL OR NOT public.bar_staff_can_serve(auth.uid(), _club_id) THEN
    RAISE EXCEPTION 'You do not have bar permission for this club';
  END IF;
  IF length(v_q) < 2 THEN RETURN; END IF;
  RETURN QUERY
  SELECT m.id, m.name, m.club_member_number,
         CASE WHEN COALESCE(btrim(m.phone), '') = '' THEN NULL ELSE 'on file' END,
         EXISTS (SELECT 1 FROM public.member_bar_pins p WHERE p.club_member_id = m.id)
    FROM public.club_members m
   WHERE m.club_id = _club_id
     AND COALESCE(m.status, 'active') = 'active'
     AND COALESCE(m.role::text, 'member') <> 'visitor'
     AND (m.name ILIKE '%' || v_q || '%'
          OR COALESCE(m.club_member_number, '') ILIKE '%' || v_q || '%'
          OR regexp_replace(COALESCE(m.phone, ''), '\D', '', 'g') ILIKE '%' || regexp_replace(v_q, '\D', '', 'g') || '%'
             AND regexp_replace(v_q, '\D', '', 'g') <> '')
   ORDER BY m.name
   LIMIT 20;
END;
$$;

-- The only way a member-account bar charge may be created.
CREATE OR REPLACE FUNCTION public.charge_bar_to_member(
  _club_member_id uuid,
  _lines jsonb,
  _secret text,
  _method text DEFAULT 'pin',
  _source text DEFAULT 'qr',
  _signature text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_member public.club_members%ROWTYPE;
  v_actor uuid;
  v_pin public.member_bar_pins%ROWTYPE;
  v_otp public.member_bar_otps%ROWTYPE;
  v_line jsonb; v_item public.bar_items%ROWTYPE; v_qty int;
  v_total numeric := 0; v_first uuid; v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in'; END IF;
  IF _source NOT IN ('qr', 'counter', 'app') THEN RAISE EXCEPTION 'Invalid sale source'; END IF;
  IF _method NOT IN ('pin', 'otp') THEN RAISE EXCEPTION 'Invalid verification method'; END IF;

  SELECT * INTO v_member FROM public.club_members WHERE id = _club_member_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF COALESCE(v_member.status, 'active') <> 'active' THEN
    RAISE EXCEPTION 'This membership is not active';
  END IF;

  SELECT id INTO v_actor FROM public.club_members
   WHERE club_id = v_member.club_id AND user_id = auth.uid() LIMIT 1;

  IF _source = 'counter' THEN
    IF NOT public.bar_staff_can_serve(auth.uid(), v_member.club_id) THEN
      RAISE EXCEPTION 'You do not have bar permission for this club';
    END IF;
  ELSIF v_member.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'You may only charge your own member account';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clubs
     WHERE id = v_member.club_id AND COALESCE(honesty_bar_enabled, false)
  ) THEN
    RAISE EXCEPTION 'The bar is not enabled for this club';
  END IF;

  -- ---- member verification ----
  IF _method = 'pin' THEN
    SELECT * INTO v_pin FROM public.member_bar_pins WHERE club_member_id = _club_member_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'No Bar PIN has been set up yet'; END IF;
    IF v_pin.locked_until IS NOT NULL AND v_pin.locked_until > now() THEN
      RAISE EXCEPTION 'This Bar PIN is temporarily locked — please use a one-time code';
    END IF;
    IF COALESCE(_secret, '') !~ '^[0-9]{6}$' OR v_pin.pin_hash <> crypt(_secret, v_pin.pin_hash) THEN
      UPDATE public.member_bar_pins
         SET failed_attempts = failed_attempts + 1,
             locked_until = CASE WHEN failed_attempts + 1 >= 5 THEN now() + interval '15 minutes' ELSE locked_until END,
             updated_at = now()
       WHERE club_member_id = _club_member_id;
      RAISE EXCEPTION 'That Bar PIN is not correct';
    END IF;
    UPDATE public.member_bar_pins
       SET failed_attempts = 0, locked_until = NULL, updated_at = now()
     WHERE club_member_id = _club_member_id;
  ELSE
    SELECT * INTO v_otp FROM public.member_bar_otps
     WHERE club_member_id = _club_member_id AND consumed_at IS NULL AND expires_at > now()
     ORDER BY created_at DESC LIMIT 1;
    IF NOT FOUND THEN RAISE EXCEPTION 'Please request a new verification code'; END IF;
    IF v_otp.attempts >= 5 THEN RAISE EXCEPTION 'Too many attempts — please request a new code'; END IF;
    IF COALESCE(_secret, '') !~ '^[0-9]{6}$' OR v_otp.code_hash <> crypt(_secret, v_otp.code_hash) THEN
      UPDATE public.member_bar_otps SET attempts = attempts + 1 WHERE id = v_otp.id;
      RAISE EXCEPTION 'That verification code is not valid';
    END IF;
    UPDATE public.member_bar_otps SET consumed_at = now() WHERE id = v_otp.id;
    UPDATE public.member_bar_pins SET failed_attempts = 0, locked_until = NULL WHERE club_member_id = _club_member_id;
  END IF;

  IF _lines IS NULL OR jsonb_array_length(_lines) = 0 OR jsonb_array_length(_lines) > 30 THEN
    RAISE EXCEPTION 'Nothing to charge';
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(_lines) LOOP
    v_qty := COALESCE((v_line->>'quantity')::int, 0);
    IF v_qty < 1 OR v_qty > 50 THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
    SELECT * INTO v_item FROM public.bar_items
     WHERE id = (v_line->>'bar_item_id')::uuid AND club_id = v_member.club_id AND active = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'One or more items are not available'; END IF;

    INSERT INTO public.bar_tab_entries (
      club_id, club_member_id, bar_item_id, quantity, unit_price, total,
      logged_by, source, operator_member_id, verification_method, verified_at, signature
    ) VALUES (
      v_member.club_id, _club_member_id, v_item.id, v_qty, v_item.price, v_item.price * v_qty,
      COALESCE(v_actor, _club_member_id), _source,
      CASE WHEN _source = 'counter' THEN v_actor ELSE NULL END,
      _method, now(), NULLIF(btrim(COALESCE(_signature, '')), '')
    ) RETURNING id INTO v_id;

    v_first := COALESCE(v_first, v_id);
    v_total := v_total + v_item.price * v_qty;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'entry_id', v_first, 'total', v_total,
                            'member_name', v_member.name, 'verification', _method);
END;
$$;

-- Staff counter sale for a visitor (card swiped at the counter).
CREATE OR REPLACE FUNCTION public.record_bar_counter_visitor_sale(
  _club_id uuid,
  _lines jsonb,
  _visitor_name text,
  _visitor_phone text DEFAULT NULL,
  _payment_method text DEFAULT 'card'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor uuid; v_line jsonb; v_item public.bar_items%ROWTYPE; v_qty int;
  v_total numeric := 0; v_first uuid; v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.bar_staff_can_serve(auth.uid(), _club_id) THEN
    RAISE EXCEPTION 'You do not have bar permission for this club';
  END IF;
  IF _payment_method NOT IN ('card', 'cash') THEN RAISE EXCEPTION 'Invalid payment method'; END IF;
  IF COALESCE(btrim(_visitor_name), '') = '' THEN RAISE EXCEPTION 'Please capture the visitor name'; END IF;
  IF _lines IS NULL OR jsonb_array_length(_lines) = 0 OR jsonb_array_length(_lines) > 30 THEN
    RAISE EXCEPTION 'Nothing to sell';
  END IF;

  SELECT id INTO v_actor FROM public.club_members
   WHERE club_id = _club_id AND user_id = auth.uid() LIMIT 1;

  FOR v_line IN SELECT * FROM jsonb_array_elements(_lines) LOOP
    v_qty := COALESCE((v_line->>'quantity')::int, 0);
    IF v_qty < 1 OR v_qty > 50 THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
    SELECT * INTO v_item FROM public.bar_items
     WHERE id = (v_line->>'bar_item_id')::uuid AND club_id = _club_id AND active = true;
    IF NOT FOUND THEN RAISE EXCEPTION 'One or more items are not available'; END IF;

    INSERT INTO public.bar_visitor_sales (
      club_id, bar_item_id, quantity, unit_price, total, payment_method,
      visitor_name, visitor_phone, note, payment_status, logged_by,
      source, operator_member_id, customer_type
    ) VALUES (
      _club_id, v_item.id, v_qty, v_item.price, v_item.price * v_qty, _payment_method,
      btrim(_visitor_name), NULLIF(btrim(COALESCE(_visitor_phone, '')), ''),
      'Counter sale', 'paid', v_actor, 'counter', v_actor, 'visitor'
    ) RETURNING id INTO v_id;

    v_first := COALESCE(v_first, v_id);
    v_total := v_total + v_item.price * v_qty;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'sale_id', v_first, 'total', v_total,
                            'reference', 'BAR-' || upper(substr(v_first::text, 1, 8)));
END;
$$;

REVOKE ALL ON FUNCTION public.bar_staff_can_serve(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bar_staff_can_serve(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_my_bar_pin(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_bar_pin_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bar_search_members(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.charge_bar_to_member(uuid, jsonb, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_bar_counter_visitor_sale(uuid, jsonb, text, text, text) TO authenticated;
