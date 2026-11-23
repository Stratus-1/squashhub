ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS visitor_fee_prepay_required boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.clubs.visitor_fee_prepay_required IS 'When true, a member booking with a named visitor must have enough account credit for the visitor fee or pay it by card first.';

CREATE TABLE public.visitor_fee_prepayments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  club_member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  user_id uuid,
  booking_id uuid NOT NULL,
  guest_name text,
  booking_date date,
  start_time time,
  court_id integer,
  amount numeric(10,2) NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid')),
  stitch_session_id uuid,
  payment_reference text,
  paid_at timestamptz,
  used_booking_id uuid,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.visitor_fee_prepayments TO authenticated;
GRANT ALL ON public.visitor_fee_prepayments TO service_role;
ALTER TABLE public.visitor_fee_prepayments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members and club finance read visitor fee prepayments" ON public.visitor_fee_prepayments
  FOR SELECT TO authenticated
  USING (public.is_member_owner(club_member_id)
    OR public.is_club_admin_or_permitted(auth.uid(), club_id, 'finance')
    OR public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE UNIQUE INDEX visitor_fee_prepayments_used_booking_uq ON public.visitor_fee_prepayments(used_booking_id) WHERE used_booking_id IS NOT NULL;
CREATE INDEX visitor_fee_prepayments_member_idx ON public.visitor_fee_prepayments(club_member_id, status) WHERE used_booking_id IS NULL;

ALTER TABLE public.stitch_payment_sessions DROP CONSTRAINT IF EXISTS stitch_payment_sessions_purpose_check;
ALTER TABLE public.stitch_payment_sessions ADD CONSTRAINT stitch_payment_sessions_purpose_check
  CHECK (purpose = ANY (ARRAY['fee'::text, 'topup'::text, 'tournament'::text, 'visitor_fee'::text]));

-- A member's booking that names a visitor instead of a member opponent.
CREATE OR REPLACE FUNCTION public._is_visitor_guest_booking(_status text, _type text, _event uuid, _source text, _guest text, _opp_member uuid, _opp uuid, _member uuid)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT _status = 'active' AND COALESCE(_type,'match') = 'match' AND _event IS NULL
    AND COALESCE(_source,'squashhub') = 'squashhub'
    AND btrim(COALESCE(_guest,'')) <> '' AND _opp_member IS NULL AND _opp IS NULL AND _member IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION public.visitor_fee_prepay_active(_club_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT c.visitor_fee_prepay_required
      AND COALESCE(c.visitor_booking_fee,0) > 0
      AND (c.payment_gateway = 'stitch' OR 'stitch' = ANY(COALESCE(c.payment_gateways, '{}'::text[])))
    FROM public.clubs c WHERE c.id = _club_id), false)
$$;

-- Fee the member would be charged for this visitor booking (mirrors charge_visitor_booking_fee).
CREATE OR REPLACE FUNCTION public.visitor_fee_due(_club_id uuid, _club_member_id uuid, _date date, _start_time time, _exclude_booking uuid)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_fee numeric; v_free int; v_role text; v_used int;
BEGIN
  SELECT COALESCE(visitor_booking_fee,0), COALESCE(free_visitor_bookings_per_year,0) INTO v_fee, v_free FROM public.clubs WHERE id = _club_id;
  IF COALESCE(v_fee,0) <= 0 THEN RETURN 0; END IF;
  SELECT lower(role::text) INTO v_role FROM public.club_members WHERE id = _club_member_id AND club_id = _club_id;
  IF v_role IS NULL OR v_role = 'visitor' THEN RETURN 0; END IF;
  IF v_free > 0 THEN
    SELECT count(*) INTO v_used FROM public.bookings o
    WHERE o.club_id = _club_id AND o.club_member_id = _club_member_id AND o.id IS DISTINCT FROM _exclude_booking
      AND public._is_visitor_guest_booking(o.status, o.booking_type, o.event_id, o.source, o.guest_name, o.opponent_member_id, o.opponent_id, o.club_member_id)
      AND extract(year FROM o.date) = extract(year FROM _date)
      AND (o.date, o.start_time) < (_date, COALESCE(_start_time, '23:59'::time));
    IF v_used < v_free THEN RETURN 0; END IF;
  END IF;
  RETURN v_fee;
END $$;

-- Does the member's account cover this fee plus their other not-yet-charged, unpaid visitor bookings?
CREATE OR REPLACE FUNCTION public._visitor_fee_credit_covers(_club_id uuid, _club_member_id uuid, _fee numeric, _exclude_booking uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pending numeric; g record; v_fee numeric;
BEGIN
  SELECT COALESCE(visitor_booking_fee,0) INTO v_fee FROM public.clubs WHERE id = _club_id;
  SELECT COALESCE(count(*),0) * v_fee INTO v_pending FROM public.bookings b
  WHERE b.club_id = _club_id AND b.club_member_id = _club_member_id AND b.id IS DISTINCT FROM _exclude_booking
    AND b.visitor_fee_charged_at IS NULL
    AND b.date >= ((now() AT TIME ZONE 'Africa/Johannesburg')::date - 1)
    AND public._is_visitor_guest_booking(b.status, b.booking_type, b.event_id, b.source, b.guest_name, b.opponent_member_id, b.opponent_id, b.club_member_id)
    AND NOT EXISTS (SELECT 1 FROM public.visitor_fee_prepayments p WHERE p.used_booking_id = b.id);
  SELECT * INTO g FROM public.member_account_gate(_club_member_id, COALESCE(_fee,0) + COALESCE(v_pending,0));
  RETURN round(g.projected_owing - g.allowance, 2) <= 0;
END $$;

CREATE OR REPLACE FUNCTION public._visitor_fee_unused_prepayment(_club_id uuid, _club_member_id uuid, _fee numeric, _booking_id uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.visitor_fee_prepayments
  WHERE club_id = _club_id AND club_member_id = _club_member_id AND status = 'paid'
    AND used_booking_id IS NULL AND amount >= _fee
  ORDER BY (booking_id = _booking_id) DESC, paid_at
  LIMIT 1
$$;

-- Booking screen check: must the member pay the visitor fee by card first?
CREATE OR REPLACE FUNCTION public.visitor_fee_booking_check(_club_id uuid, _club_member_id uuid, _date date, _start_time time, _booking_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_fee numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
  IF _club_member_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.club_members WHERE id = _club_member_id AND club_id = _club_id) THEN
    RAISE EXCEPTION 'Member does not belong to this club' USING ERRCODE='42501';
  END IF;
  IF NOT (public.can_book_linked_member(_club_id, _club_member_id) OR public.is_club_admin_or_permitted(auth.uid(), _club_id, 'courts') OR public.has_role(auth.uid(), 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'Not allowed to book for this member' USING ERRCODE='42501';
  END IF;
  IF NOT public.visitor_fee_prepay_active(_club_id) OR public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN jsonb_build_object('required', false, 'fee', 0);
  END IF;
  v_fee := public.visitor_fee_due(_club_id, _club_member_id, _date, _start_time, _booking_id);
  IF v_fee <= 0 THEN RETURN jsonb_build_object('required', false, 'fee', 0); END IF;
  IF public._visitor_fee_unused_prepayment(_club_id, _club_member_id, v_fee, _booking_id) IS NOT NULL THEN
    RETURN jsonb_build_object('required', false, 'fee', v_fee, 'prepaid', true);
  END IF;
  IF public._visitor_fee_credit_covers(_club_id, _club_member_id, v_fee, _booking_id) THEN
    RETURN jsonb_build_object('required', false, 'fee', v_fee, 'covered', true);
  END IF;
  RETURN jsonb_build_object('required', true, 'fee', v_fee);
END $$;

-- Create (or reuse) the pending prepayment the card payment will settle. Amount comes from the server.
CREATE OR REPLACE FUNCTION public.visitor_fee_prepayment_start(_club_id uuid, _club_member_id uuid, _booking_id uuid, _date date, _start_time time, _court_id integer, _guest_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_fee numeric; v_id uuid; v_guest text := btrim(COALESCE(_guest_name,''));
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in required' USING ERRCODE='42501'; END IF;
  IF _club_member_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.club_members WHERE id = _club_member_id AND club_id = _club_id) THEN
    RAISE EXCEPTION 'Member does not belong to this club' USING ERRCODE='42501';
  END IF;
  IF NOT public.can_book_linked_member(_club_id, _club_member_id) THEN RAISE EXCEPTION 'Not allowed to pay for this member' USING ERRCODE='42501'; END IF;
  IF _booking_id IS NULL OR _date IS NULL OR _start_time IS NULL THEN RAISE EXCEPTION 'Booking details are missing'; END IF;
  IF _date < (now() AT TIME ZONE 'Africa/Johannesburg')::date THEN RAISE EXCEPTION 'This booking date has passed'; END IF;
  IF length(v_guest) < 1 OR length(v_guest) > 80 THEN RAISE EXCEPTION 'Enter the visitor''s name'; END IF;
  IF NOT public.visitor_fee_prepay_active(_club_id) THEN RETURN jsonb_build_object('required', false); END IF;
  v_fee := public.visitor_fee_due(_club_id, _club_member_id, _date, _start_time, _booking_id);
  IF v_fee <= 0
     OR public._visitor_fee_unused_prepayment(_club_id, _club_member_id, v_fee, _booking_id) IS NOT NULL
     OR public._visitor_fee_credit_covers(_club_id, _club_member_id, v_fee, _booking_id) THEN
    RETURN jsonb_build_object('required', false);
  END IF;
  SELECT id INTO v_id FROM public.visitor_fee_prepayments
   WHERE club_member_id = _club_member_id AND booking_id = _booking_id AND status = 'pending' FOR UPDATE;
  IF v_id IS NULL THEN
    INSERT INTO public.visitor_fee_prepayments(club_id, club_member_id, user_id, booking_id, guest_name, booking_date, start_time, court_id, amount)
    VALUES (_club_id, _club_member_id, auth.uid(), _booking_id, v_guest, _date, _start_time, _court_id, v_fee)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.visitor_fee_prepayments SET amount = v_fee, guest_name = v_guest, booking_date = _date,
      start_time = _start_time, court_id = _court_id, updated_at = now() WHERE id = v_id;
  END IF;
  RETURN jsonb_build_object('required', true, 'id', v_id, 'amount', v_fee);
END $$;

-- Payment confirmation (service role only, idempotent).
CREATE OR REPLACE FUNCTION public.visitor_fee_prepayment_settle(_id uuid, _session_id uuid, _reference text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n int;
BEGIN
  UPDATE public.visitor_fee_prepayments
     SET status = 'paid', paid_at = now(), payment_reference = _reference,
         stitch_session_id = COALESCE(stitch_session_id, _session_id), updated_at = now()
   WHERE id = _id AND status = 'pending';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n > 0;
END $$;

-- Server-side rule on every booking writer.
CREATE OR REPLACE FUNCTION public.enforce_visitor_fee_prepay()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_fee numeric; v_pp uuid;
BEGIN
  IF NOT public._is_visitor_guest_booking(NEW.status, NEW.booking_type, NEW.event_id, NEW.source, NEW.guest_name, NEW.opponent_member_id, NEW.opponent_id, NEW.club_member_id) THEN RETURN NEW; END IF;
  IF NEW.visitor_fee_charged_at IS NOT NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE'
     AND public._is_visitor_guest_booking(OLD.status, OLD.booking_type, OLD.event_id, OLD.source, OLD.guest_name, OLD.opponent_member_id, OLD.opponent_id, OLD.club_member_id)
     AND OLD.club_member_id = NEW.club_member_id AND OLD.date = NEW.date THEN
    RETURN NEW;
  END IF;
  IF NOT public.visitor_fee_prepay_active(NEW.club_id) THEN RETURN NEW; END IF;
  IF auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'admin'::public.app_role) THEN RETURN NEW; END IF;
  v_fee := public.visitor_fee_due(NEW.club_id, NEW.club_member_id, NEW.date, NEW.start_time, NEW.id);
  IF v_fee <= 0 THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.visitor_fee_prepayments WHERE used_booking_id = NEW.id AND status = 'paid') THEN RETURN NEW; END IF;
  SELECT id INTO v_pp FROM public.visitor_fee_prepayments
   WHERE club_id = NEW.club_id AND club_member_id = NEW.club_member_id AND status = 'paid'
     AND used_booking_id IS NULL AND amount >= v_fee
   ORDER BY (booking_id = NEW.id) DESC, paid_at
   LIMIT 1 FOR UPDATE SKIP LOCKED;
  IF v_pp IS NOT NULL THEN
    UPDATE public.visitor_fee_prepayments SET used_booking_id = NEW.id, used_at = now(), updated_at = now() WHERE id = v_pp;
    RETURN NEW;
  END IF;
  IF public._visitor_fee_credit_covers(NEW.club_id, NEW.club_member_id, v_fee, NEW.id) THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'VISITOR_FEE_PREPAY: Pay the R% visitor fee before booking with a visitor.', to_char(v_fee, 'FM999990.00') USING ERRCODE = 'P0001';
END $$;

CREATE TRIGGER zzz_enforce_visitor_fee_prepay
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.enforce_visitor_fee_prepay();

-- A cancelled (or no longer visitor) booking that was never charged frees its card payment for the next visitor booking.
CREATE OR REPLACE FUNCTION public.release_visitor_fee_prepayment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.visitor_fee_charged_at IS NULL THEN
      UPDATE public.visitor_fee_prepayments SET used_booking_id = NULL, used_at = NULL, updated_at = now() WHERE used_booking_id = OLD.id;
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.visitor_fee_charged_at IS NULL
     AND NOT public._is_visitor_guest_booking(NEW.status, NEW.booking_type, NEW.event_id, NEW.source, NEW.guest_name, NEW.opponent_member_id, NEW.opponent_id, NEW.club_member_id) THEN
    UPDATE public.visitor_fee_prepayments SET used_booking_id = NULL, used_at = NULL, updated_at = now() WHERE used_booking_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_release_visitor_fee_prepayment
  AFTER UPDATE OR DELETE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.release_visitor_fee_prepayment();

REVOKE ALL ON FUNCTION public.visitor_fee_due(uuid, uuid, date, time, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._visitor_fee_credit_covers(uuid, uuid, numeric, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._visitor_fee_unused_prepayment(uuid, uuid, numeric, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.visitor_fee_prepayment_settle(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_visitor_fee_prepay() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_visitor_fee_prepayment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.visitor_fee_booking_check(uuid, uuid, date, time, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.visitor_fee_prepayment_start(uuid, uuid, uuid, date, time, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.visitor_fee_booking_check(uuid, uuid, date, time, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.visitor_fee_prepayment_start(uuid, uuid, uuid, date, time, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.visitor_fee_prepayment_settle(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.visitor_fee_due(uuid, uuid, date, time, uuid) TO service_role;