
-- Opt-in peak-hour cancellation restriction (A) and penalty fees (B). All OFF / 0 by default.
ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS peak_cancel_restrict_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS peak_penalties_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS peak_penalties_enabled_at timestamptz,
  ADD COLUMN IF NOT EXISTS peak_late_cancel_allowed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS peak_late_cancel_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS peak_no_show_fee numeric NOT NULL DEFAULT 0;

-- Stamp when penalties are switched on so nothing is ever charged retrospectively.
CREATE OR REPLACE FUNCTION public.stamp_peak_penalties_enabled()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.peak_penalties_enabled AND NOT COALESCE(OLD.peak_penalties_enabled, false) THEN
    NEW.peak_penalties_enabled_at := now();
  ELSIF NOT NEW.peak_penalties_enabled THEN
    NEW.peak_penalties_enabled_at := NULL;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_stamp_peak_penalties_enabled ON public.clubs;
CREATE TRIGGER trg_stamp_peak_penalties_enabled BEFORE UPDATE OF peak_penalties_enabled ON public.clubs
  FOR EACH ROW EXECUTE FUNCTION public.stamp_peak_penalties_enabled();

CREATE TABLE IF NOT EXISTS public.booking_penalties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL UNIQUE,
  club_member_id uuid REFERENCES public.club_members(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('late_cancel','no_show','admin_late_cancel')),
  amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL CHECK (status IN ('charged','waived')),
  fee_payment_id uuid,
  journal_ref uuid,
  reason text,
  actor_user_id uuid,
  booking_date date,
  booking_start time,
  court_id integer,
  waived_by uuid,
  waived_at timestamptz,
  waive_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.booking_penalties TO authenticated;
GRANT ALL ON public.booking_penalties TO service_role;
ALTER TABLE public.booking_penalties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Club admins and the member can view booking penalties" ON public.booking_penalties
  FOR SELECT TO authenticated USING (
    public.is_club_admin(auth.uid(), club_id)
    OR EXISTS (SELECT 1 FROM public.club_members cm WHERE cm.id = booking_penalties.club_member_id AND cm.user_id = auth.uid())
  );

-- Is SquashHub the lighting provider for this club? (never inferred from the booking platform)
CREATE OR REPLACE FUNCTION public.club_squashhub_lighting(_club_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT lights_integration_enabled FROM public.clubs WHERE id = _club_id), false)
$$;

-- Peak + late-window status for one booking (club local time, Africa/Johannesburg).
CREATE OR REPLACE FUNCTION public.booking_peak_late_status(_booking_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.bookings; c public.clubs; w record; v_now timestamp; v_start timestamp; v_slot int; v_peak boolean := false;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id;
  IF b.id IS NULL THEN RETURN jsonb_build_object('found', false); END IF;
  SELECT * INTO c FROM public.clubs WHERE id = b.club_id;
  SELECT * INTO w FROM public.club_peak_window(c, b.date);
  IF w.peak_start IS NOT NULL AND b.start_time >= w.peak_start AND b.start_time < w.peak_end THEN v_peak := true; END IF;
  v_slot := COALESCE(c.booking_slot_minutes, 30);
  v_now := (now() AT TIME ZONE 'Africa/Johannesburg');
  v_start := b.date + b.start_time;
  RETURN jsonb_build_object(
    'found', true, 'peak', v_peak,
    'in_late_window', v_now >= v_start - make_interval(mins => v_slot),
    'started', v_now >= v_start,
    'restrict_enabled', COALESCE(c.peak_cancel_restrict_enabled, false),
    'penalties_active', COALESCE(c.peak_penalties_enabled, false) AND COALESCE(c.lights_integration_enabled, false)
        AND c.peak_penalties_enabled_at IS NOT NULL AND b.created_at >= c.peak_penalties_enabled_at,
    'late_cancel_allowed', COALESCE(c.peak_late_cancel_allowed, false),
    'late_cancel_fee', COALESCE(c.peak_late_cancel_fee, 0),
    'slot_minutes', v_slot
  );
END $$;

-- Internal: post a penalty fee via the normal fee ledger.
CREATE OR REPLACE FUNCTION public._post_booking_penalty(_b public.bookings, _kind text, _amount numeric, _reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_fee uuid; v_ref uuid; v_label text; v_pen uuid;
BEGIN
  IF _amount > 0 AND _b.club_member_id IS NOT NULL THEN
    v_label := CASE _kind WHEN 'no_show' THEN 'Peak no-show penalty' ELSE 'Peak late-cancellation penalty' END
      || ' – ' || to_char(_b.date, 'DD Mon YYYY') || ' ' || to_char(_b.start_time, 'HH24:MI') || ' court ' || COALESCE(_b.court_id::text, '?');
    INSERT INTO public.club_member_fee_payments(club_member_id, fee_type, fee_label, amount, paid, season_year)
    VALUES (_b.club_member_id, 'booking_penalty', v_label, _amount, false, EXTRACT(year FROM _b.date)::int)
    RETURNING id INTO v_fee;
    SELECT journal_ref INTO v_ref FROM public.club_journal_entries WHERE fee_payment_id = v_fee ORDER BY created_at DESC LIMIT 1;
    IF v_ref IS NOT NULL THEN
      INSERT INTO public.ledger_audit_log(club_id, journal_ref, action, actor_user_id, after_json, note)
      VALUES (_b.club_id, v_ref, 'create', auth.uid(), jsonb_build_object('booking_id', _b.id, 'kind', _kind, 'amount', _amount), _reason);
    END IF;
  END IF;
  INSERT INTO public.booking_penalties(club_id, booking_id, club_member_id, kind, amount, status, fee_payment_id, journal_ref, reason, actor_user_id, booking_date, booking_start, court_id)
  VALUES (_b.club_id, _b.id, _b.club_member_id, _kind, COALESCE(_amount,0), 'charged', v_fee, v_ref, _reason, auth.uid(), _b.date, _b.start_time, _b.court_id)
  RETURNING id INTO v_pen;
  RETURN v_pen;
END $$;

-- Rule-checked cancel used by the app. Sets a flag so the guard trigger lets it through.
CREATE OR REPLACE FUNCTION public.cancel_booking_checked(_booking_id uuid, _reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.bookings; s jsonb; v_admin boolean; v_owner boolean; v_fee numeric := 0; v_kind text := NULL;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id;
  IF b.id IS NULL THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF b.status = 'cancelled' THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;
  v_admin := public.is_club_admin(auth.uid(), b.club_id);
  v_owner := b.user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.club_members cm WHERE cm.id = b.club_member_id AND cm.user_id = auth.uid());
  IF NOT v_admin AND NOT v_owner THEN RAISE EXCEPTION 'Not authorised to cancel this booking'; END IF;

  s := public.booking_peak_late_status(_booking_id);
  IF (s->>'restrict_enabled')::boolean AND (s->>'peak')::boolean AND (s->>'in_late_window')::boolean THEN
    IF v_admin THEN
      IF COALESCE(trim(_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required to cancel inside the late-cancellation window'; END IF;
      v_kind := 'admin_late_cancel';
    ELSIF (s->>'started')::boolean THEN
      RAISE EXCEPTION 'This peak booking has already started and can no longer be cancelled';
    ELSIF (s->>'penalties_active')::boolean AND (s->>'late_cancel_allowed')::boolean THEN
      v_kind := 'late_cancel'; v_fee := (s->>'late_cancel_fee')::numeric;
    ELSE
      RAISE EXCEPTION 'Peak bookings can''t be cancelled once the previous slot has started. Please contact the club.';
    END IF;
  END IF;

  PERFORM set_config('app.cancel_checked', '1', true);
  UPDATE public.bookings SET status = 'cancelled' WHERE id = _booking_id;

  IF v_kind = 'admin_late_cancel' THEN
    INSERT INTO public.booking_penalties(club_id, booking_id, club_member_id, kind, amount, status, reason, actor_user_id, booking_date, booking_start, court_id, waived_by, waived_at, waive_reason)
    VALUES (b.club_id, b.id, b.club_member_id, 'admin_late_cancel', 0, 'waived', _reason, auth.uid(), b.date, b.start_time, b.court_id, auth.uid(), now(), _reason)
    ON CONFLICT (booking_id) DO NOTHING;
  ELSIF v_kind = 'late_cancel' THEN
    IF NOT EXISTS (SELECT 1 FROM public.booking_penalties WHERE booking_id = b.id) THEN
      PERFORM public._post_booking_penalty(b, 'late_cancel', v_fee, COALESCE(_reason, 'Member cancelled inside late window'));
    END IF;
  END IF;
  RETURN jsonb_build_object('ok', true, 'penalty', v_kind, 'fee', v_fee);
END $$;

-- Guard: members cannot bypass the restriction with a direct update/delete.
CREATE OR REPLACE FUNCTION public.guard_peak_late_cancel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s jsonb; v_id uuid := COALESCE(NEW.id, OLD.id); v_club uuid := COALESCE(NEW.club_id, OLD.club_id);
BEGIN
  IF auth.uid() IS NULL OR current_setting('app.cancel_checked', true) = '1' THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'UPDATE' AND NOT (NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled') THEN RETURN NEW; END IF;
  IF public.is_club_admin(auth.uid(), v_club) THEN RETURN COALESCE(NEW, OLD); END IF;
  IF NOT COALESCE((SELECT peak_cancel_restrict_enabled FROM public.clubs WHERE id = v_club), false) THEN RETURN COALESCE(NEW, OLD); END IF;
  s := public.booking_peak_late_status(v_id);
  IF (s->>'peak')::boolean AND (s->>'in_late_window')::boolean THEN
    RAISE EXCEPTION 'Peak bookings can''t be cancelled once the previous slot has started.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
DROP TRIGGER IF EXISTS trg_guard_peak_late_cancel_upd ON public.bookings;
CREATE TRIGGER trg_guard_peak_late_cancel_upd BEFORE UPDATE OF status ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_peak_late_cancel();
DROP TRIGGER IF EXISTS trg_guard_peak_late_cancel_del ON public.bookings;
CREATE TRIGGER trg_guard_peak_late_cancel_del BEFORE DELETE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.guard_peak_late_cancel();

-- Admin-confirmed no-show (SquashHub-lighting clubs with penalties switched on only).
CREATE OR REPLACE FUNCTION public.admin_confirm_booking_no_show(_booking_id uuid, _note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.bookings; c public.clubs; s jsonb; v_pen uuid;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id = _booking_id;
  IF b.id IS NULL THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF NOT public.is_club_admin(auth.uid(), b.club_id) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  IF EXISTS (SELECT 1 FROM public.booking_penalties WHERE booking_id = b.id) THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;
  SELECT * INTO c FROM public.clubs WHERE id = b.club_id;
  s := public.booking_peak_late_status(_booking_id);
  IF NOT (s->>'penalties_active')::boolean THEN RAISE EXCEPTION 'No-show penalties are not active for this booking'; END IF;
  IF NOT (s->>'peak')::boolean THEN RAISE EXCEPTION 'Only peak-hour bookings carry a no-show penalty'; END IF;
  IF NOT (s->>'started')::boolean THEN RAISE EXCEPTION 'The booking has not started yet'; END IF;
  IF b.status = 'cancelled' THEN RAISE EXCEPTION 'Cancelled bookings cannot be marked as a no-show'; END IF;
  v_pen := public._post_booking_penalty(b, 'no_show', COALESCE(c.peak_no_show_fee, 0), COALESCE(_note, 'No-show confirmed by admin'));
  RETURN jsonb_build_object('ok', true, 'penalty_id', v_pen);
END $$;

-- Waive a penalty: audited reversal, never a deletion of the journal.
CREATE OR REPLACE FUNCTION public.admin_waive_booking_penalty(_penalty_id uuid, _reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p public.booking_penalties; v_paid boolean;
BEGIN
  SELECT * INTO p FROM public.booking_penalties WHERE id = _penalty_id;
  IF p.id IS NULL THEN RAISE EXCEPTION 'Penalty not found'; END IF;
  IF NOT public.is_club_admin(auth.uid(), p.club_id) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  IF COALESCE(trim(_reason), '') = '' THEN RAISE EXCEPTION 'A reason is required'; END IF;
  IF p.status = 'waived' THEN RETURN jsonb_build_object('ok', true, 'already', true); END IF;
  IF p.fee_payment_id IS NOT NULL THEN
    SELECT paid INTO v_paid FROM public.club_member_fee_payments WHERE id = p.fee_payment_id;
    IF v_paid THEN RAISE EXCEPTION 'This penalty has already been paid; refund it through the member account instead'; END IF;
  END IF;
  IF p.journal_ref IS NOT NULL THEN
    PERFORM public.admin_reverse_journal_group(p.journal_ref, 'Penalty waived: ' || _reason);
  END IF;
  IF p.fee_payment_id IS NOT NULL THEN
    DELETE FROM public.club_member_fee_payments WHERE id = p.fee_payment_id AND paid = false;
  END IF;
  UPDATE public.booking_penalties SET status = 'waived', waived_by = auth.uid(), waived_at = now(), waive_reason = _reason WHERE id = p.id;
  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE ALL ON FUNCTION public._post_booking_penalty(public.bookings, text, numeric, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_booking_checked(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.booking_peak_late_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_confirm_booking_no_show(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_waive_booking_penalty(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.club_squashhub_lighting(uuid) TO authenticated;
