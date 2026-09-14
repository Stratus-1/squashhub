CREATE OR REPLACE FUNCTION public.mobile_booking_row_payload(p_booking public.bookings)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'id', p_booking.id,
    'club_id', p_booking.club_id,
    'club_member_id', p_booking.club_member_id,
    'player_member_id', p_booking.club_member_id,
    'player_name', booker.name,
    'court_id', p_booking.court_id,
    'court_name', court.name,
    'court_type', COALESCE(court.venue_name, 'Court'),
    'date', p_booking.date,
    'start_time', p_booking.start_time,
    'end_time', p_booking.end_time,
    'status', p_booking.status,
    'booking_type', p_booking.booking_type,
    'is_friendly', p_booking.is_friendly,
    'guest_name', p_booking.guest_name,
    'opponent_member_id', p_booking.opponent_member_id,
    'opponent_name', opponent.name,
    'source', p_booking.source,
    'external_id', p_booking.external_id,
    'challenge_id', p_booking.challenge_id,
    'lights_requested', p_booking.lights_requested,
    'light_fee_split', p_booking.light_fee_split,
    'light_status', CASE
      WHEN p_booking.lights_requested AND p_booking.shelly_schedule_on_id IS NOT NULL AND p_booking.shelly_schedule_off_id IS NOT NULL THEN 'scheduled'
      WHEN p_booking.lights_requested THEN 'requested'
      ELSE 'not_requested'
    END,
    'canManage', (
      COALESCE(p_booking.source, 'squashhub') = 'squashhub'
      AND COALESCE(p_booking.status, 'active') = 'active'
    ),
    'canCancel', COALESCE(p_booking.status, 'active') = 'active',
    'canMove', (
      COALESCE(p_booking.source, 'squashhub') = 'squashhub'
      AND COALESCE(p_booking.status, 'active') = 'active'
    ),
    'created_at', p_booking.created_at
  )
  FROM public.courts court
  LEFT JOIN public.club_members booker ON booker.id = p_booking.club_member_id
  LEFT JOIN public.club_members opponent ON opponent.id = p_booking.opponent_member_id
  WHERE court.id = p_booking.court_id;
$$;

REVOKE ALL ON FUNCTION public.mobile_booking_row_payload(public.bookings) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mobile_booking_row_payload(public.bookings) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mobile_booking_balance_gate(
  p_club_id uuid,
  p_member_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_buffer numeric;
  v_current_owing numeric := 0;
  v_plan_allowed_debt numeric := 0;
  v_has_mandate boolean := false;
  v_shortfall numeric := 0;
BEGIN
  SELECT min_booking_balance
  INTO v_buffer
  FROM public.clubs
  WHERE id = p_club_id;

  IF v_buffer IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'shortfall', 0,
      'currentOwing', 0,
      'planAllowedDebt', 0,
      'requiredBuffer', 0
    );
  END IF;

  SELECT COALESCE(SUM(COALESCE(debit, 0) - COALESCE(credit, 0)), 0)
  INTO v_current_owing
  FROM public.club_journal_entries
  WHERE club_member_id = p_member_id
    AND account IN ('debtors', 'member_credits');

  SELECT EXISTS (
    SELECT 1
    FROM public.stitch_mandates
    WHERE club_member_id = p_member_id
      AND status = 'active'
      AND frequency = 'monthly'
      AND suspended_at IS NULL
  )
  INTO v_has_mandate;

  IF v_has_mandate THEN
    SELECT COALESCE(SUM(COALESCE(amount, 0)), 0)
    INTO v_plan_allowed_debt
    FROM public.club_member_fee_payments
    WHERE club_member_id = p_member_id
      AND paid = false;
  ELSE
    SELECT COALESCE(SUM(COALESCE(amount, 0)), 0)
    INTO v_plan_allowed_debt
    FROM public.club_member_fee_payments
    WHERE club_member_id = p_member_id
      AND paid = false
      AND fee_type IN ('membership', 'club_membership');
  END IF;

  IF v_current_owing > v_plan_allowed_debt THEN
    v_plan_allowed_debt := v_current_owing;
  END IF;

  v_shortfall := v_current_owing - v_plan_allowed_debt + v_buffer;

  RETURN jsonb_build_object(
    'allowed', v_shortfall <= 0,
    'shortfall', CASE WHEN v_shortfall > 0 THEN ROUND(v_shortfall, 2) ELSE 0 END,
    'currentOwing', ROUND(v_current_owing, 2),
    'planAllowedDebt', ROUND(v_plan_allowed_debt, 2),
    'requiredBuffer', ROUND(v_buffer, 2)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mobile_booking_balance_gate(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mobile_booking_balance_gate(uuid, uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mobile_booking_assert_ready(
  p_sync_secret text,
  p_club_id uuid,
  p_member_id uuid,
  p_court_id integer,
  p_date date,
  p_start_time time,
  p_duration_minutes integer,
  p_opponent_member_id uuid DEFAULT NULL,
  p_ignore_booking_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_member public.club_members%ROWTYPE;
  v_opponent public.club_members%ROWTYPE;
  v_club public.clubs%ROWTYPE;
  v_court public.courts%ROWTYPE;
  v_end_time time;
  v_member_status text;
  v_member_role text;
  v_is_access_suspended boolean;
  v_balance jsonb;
BEGIN
  IF NOT public.mobile_internal_secret_ok(p_sync_secret) THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  IF p_duration_minutes NOT IN (30, 60) THEN
    RAISE EXCEPTION 'Bookings must be 30 minutes or 1 hour' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_member
  FROM public.club_members
  WHERE id = p_member_id
    AND club_id = p_club_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member does not belong to selected club' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_club FROM public.clubs WHERE id = p_club_id LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Club not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_court
  FROM public.courts
  WHERE id = p_court_id
    AND club_id = p_club_id
    AND COALESCE(is_external, false) = false
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Court does not belong to the selected club' USING ERRCODE = '42501';
  END IF;

  v_end_time := (p_start_time + (p_duration_minutes::text || ' minutes')::interval)::time;

  IF p_date < (now() AT TIME ZONE 'Africa/Johannesburg')::date THEN
    RAISE EXCEPTION 'Cannot book a past date' USING ERRCODE = '22023';
  END IF;

  IF p_date = (now() AT TIME ZONE 'Africa/Johannesburg')::date
    AND p_start_time <= (now() AT TIME ZONE 'Africa/Johannesburg')::time THEN
    RAISE EXCEPTION 'Cannot book a past time' USING ERRCODE = '22023';
  END IF;

  IF p_start_time < COALESCE(v_club.booking_open_time, time '05:00') THEN
    RAISE EXCEPTION 'This club is not open for bookings at that time' USING ERRCODE = '22023';
  END IF;

  IF p_start_time > COALESCE(v_club.booking_last_slot_time, time '22:00') THEN
    RAISE EXCEPTION 'This is after the club last booking time' USING ERRCODE = '22023';
  END IF;

  v_member_status := lower(COALESCE(v_member.status::text, ''));
  v_member_role := lower(COALESCE(v_member.role::text, ''));
  v_is_access_suspended := v_member.access_suspended_at IS NOT NULL
    OR v_member.suspended_at IS NOT NULL
    OR COALESCE(v_member.suspension_manual, false)
    OR COALESCE(v_member.suspension_status::text, '') NOT IN ('', 'active', 'clear', 'none', 'not_suspended');

  IF v_is_access_suspended
    OR v_member_status IN ('cancelled', 'inactive', 'suspended', 'rejected', 'archived', 'resigned')
    OR (v_member_role = 'visitor' AND NOT COALESCE(v_club.visitors_can_book, false)) THEN
    RAISE EXCEPTION 'This member cannot book courts at the selected club' USING ERRCODE = '42501';
  END IF;

  IF p_opponent_member_id IS NOT NULL THEN
    IF p_opponent_member_id = p_member_id THEN
      RAISE EXCEPTION 'Choose a different opponent' USING ERRCODE = '22023';
    END IF;

    SELECT * INTO v_opponent
    FROM public.club_members
    WHERE id = p_opponent_member_id
      AND club_id = p_club_id
    LIMIT 1;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Opponent does not belong to the selected club' USING ERRCODE = '42501';
    END IF;

    IF lower(COALESCE(v_opponent.status::text, '')) IN ('cancelled', 'inactive', 'suspended', 'rejected', 'archived', 'resigned') THEN
      RAISE EXCEPTION 'Opponent cannot be added to bookings' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.club_id = p_club_id
      AND b.court_id = p_court_id
      AND b.date = p_date
      AND COALESCE(b.status, 'active') = 'active'
      AND (p_ignore_booking_id IS NULL OR b.id <> p_ignore_booking_id)
      AND b.start_time < v_end_time
      AND b.end_time > p_start_time
  ) THEN
    RAISE EXCEPTION 'This slot is already booked' USING ERRCODE = '23P01';
  END IF;

  v_balance := public.mobile_booking_balance_gate(p_club_id, p_member_id);
  IF NOT COALESCE((v_balance->>'allowed')::boolean, true) THEN
    RAISE EXCEPTION 'Account balance is below the minimum required to book. Shortfall: %', COALESCE(v_balance->>'shortfall', '0')
      USING ERRCODE = '23514';
  END IF;

  RETURN jsonb_build_object(
    'memberUserId', v_member.user_id,
    'opponentUserId', CASE WHEN p_opponent_member_id IS NULL THEN NULL ELSE v_opponent.user_id END,
    'endTime', v_end_time,
    'balance', v_balance
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mobile_booking_assert_ready(text, uuid, uuid, integer, date, time, integer, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mobile_booking_assert_ready(text, uuid, uuid, integer, date, time, integer, uuid, uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mobile_booking_create(
  p_sync_secret text,
  p_club_id uuid,
  p_member_id uuid,
  p_court_id integer,
  p_date date,
  p_start_time time,
  p_duration_minutes integer,
  p_opponent_member_id uuid DEFAULT NULL,
  p_is_friendly boolean DEFAULT true,
  p_lights_requested boolean DEFAULT false,
  p_light_fee_split text DEFAULT 'booker'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_ready jsonb;
  v_booking public.bookings%ROWTYPE;
BEGIN
  v_ready := public.mobile_booking_assert_ready(
    p_sync_secret,
    p_club_id,
    p_member_id,
    p_court_id,
    p_date,
    p_start_time,
    p_duration_minutes,
    p_opponent_member_id,
    NULL
  );

  INSERT INTO public.bookings (
    club_id,
    court_id,
    user_id,
    club_member_id,
    date,
    start_time,
    end_time,
    opponent_id,
    opponent_member_id,
    is_friendly,
    lights_requested,
    light_fee_split,
    source,
    status
  )
  VALUES (
    p_club_id,
    p_court_id,
    NULLIF(v_ready->>'memberUserId', '')::uuid,
    p_member_id,
    p_date,
    p_start_time,
    (v_ready->>'endTime')::time,
    NULLIF(v_ready->>'opponentUserId', '')::uuid,
    p_opponent_member_id,
    COALESCE(p_is_friendly, true),
    COALESCE(p_lights_requested, false),
    CASE WHEN p_light_fee_split = 'split' THEN 'split' ELSE 'booker' END,
    'squashhub',
    'active'
  )
  RETURNING * INTO v_booking;

  RETURN jsonb_build_object(
    'bookingId', v_booking.id,
    'status', 'created',
    'booking', public.mobile_booking_row_payload(v_booking),
    'balance', v_ready->'balance'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mobile_booking_create(text, uuid, uuid, integer, date, time, integer, uuid, boolean, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mobile_booking_create(text, uuid, uuid, integer, date, time, integer, uuid, boolean, boolean, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mobile_booking_detail_payload(
  p_sync_secret text,
  p_club_id uuid,
  p_member_id uuid,
  p_booking_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
BEGIN
  IF NOT public.mobile_internal_secret_ok(p_sync_secret) THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
    AND club_id = p_club_id
    AND (club_member_id = p_member_id OR opponent_member_id = p_member_id)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking was not found' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object('booking', public.mobile_booking_row_payload(v_booking));
END;
$$;

REVOKE ALL ON FUNCTION public.mobile_booking_detail_payload(text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mobile_booking_detail_payload(text, uuid, uuid, uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mobile_booking_history_payload(
  p_sync_secret text,
  p_club_id uuid,
  p_member_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_bookings jsonb;
BEGIN
  IF NOT public.mobile_internal_secret_ok(p_sync_secret) THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.club_members WHERE id = p_member_id AND club_id = p_club_id
  ) THEN
    RAISE EXCEPTION 'Member does not belong to selected club' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(public.mobile_booking_row_payload(b) ORDER BY b.date DESC, b.start_time DESC), '[]'::jsonb)
  INTO v_bookings
  FROM public.bookings b
  WHERE b.club_id = p_club_id
    AND (b.club_member_id = p_member_id OR b.opponent_member_id = p_member_id)
    AND b.date >= (now() AT TIME ZONE 'Africa/Johannesburg')::date - 180
    AND b.date <= (now() AT TIME ZONE 'Africa/Johannesburg')::date + 90;

  RETURN jsonb_build_object('bookings', v_bookings);
END;
$$;

REVOKE ALL ON FUNCTION public.mobile_booking_history_payload(text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mobile_booking_history_payload(text, uuid, uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mobile_booking_update(
  p_sync_secret text,
  p_club_id uuid,
  p_member_id uuid,
  p_booking_id uuid,
  p_court_id integer,
  p_date date,
  p_start_time time,
  p_duration_minutes integer,
  p_opponent_member_id uuid DEFAULT NULL,
  p_is_friendly boolean DEFAULT true,
  p_lights_requested boolean DEFAULT false,
  p_light_fee_split text DEFAULT 'booker'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_existing public.bookings%ROWTYPE;
  v_ready jsonb;
  v_booking public.bookings%ROWTYPE;
BEGIN
  IF NOT public.mobile_internal_secret_ok(p_sync_secret) THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_existing
  FROM public.bookings
  WHERE id = p_booking_id
    AND club_id = p_club_id
    AND club_member_id = p_member_id
    AND COALESCE(status, 'active') = 'active'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking cannot be changed from this account' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(v_existing.source, 'squashhub') <> 'squashhub' THEN
    RAISE EXCEPTION 'This external booking must be changed on the club booking system' USING ERRCODE = '42501';
  END IF;

  v_ready := public.mobile_booking_assert_ready(
    p_sync_secret,
    p_club_id,
    p_member_id,
    p_court_id,
    p_date,
    p_start_time,
    p_duration_minutes,
    p_opponent_member_id,
    p_booking_id
  );

  UPDATE public.bookings
  SET
    court_id = p_court_id,
    date = p_date,
    start_time = p_start_time,
    end_time = (v_ready->>'endTime')::time,
    opponent_id = NULLIF(v_ready->>'opponentUserId', '')::uuid,
    opponent_member_id = p_opponent_member_id,
    is_friendly = COALESCE(p_is_friendly, true),
    lights_requested = COALESCE(p_lights_requested, false),
    light_fee_split = CASE WHEN p_light_fee_split = 'split' THEN 'split' ELSE 'booker' END
  WHERE id = p_booking_id
  RETURNING * INTO v_booking;

  RETURN jsonb_build_object(
    'bookingId', v_booking.id,
    'status', 'updated',
    'booking', public.mobile_booking_row_payload(v_booking),
    'balance', v_ready->'balance'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mobile_booking_update(text, uuid, uuid, uuid, integer, date, time, integer, uuid, boolean, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mobile_booking_update(text, uuid, uuid, uuid, integer, date, time, integer, uuid, boolean, boolean, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mobile_booking_cancel(
  p_sync_secret text,
  p_club_id uuid,
  p_member_id uuid,
  p_booking_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_booking public.bookings%ROWTYPE;
  v_match_id text;
BEGIN
  IF NOT public.mobile_internal_secret_ok(p_sync_secret) THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_booking
  FROM public.bookings
  WHERE id = p_booking_id
    AND club_id = p_club_id
    AND club_member_id = p_member_id
    AND COALESCE(status, 'active') = 'active'
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking cannot be cancelled from this account' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(v_booking.source, 'squashhub') = 'club_event'
    AND COALESCE(v_booking.external_id, '') LIKE 'champ:%'
    AND COALESCE(v_booking.external_id, '') LIKE '%:match:%' THEN
    v_match_id := split_part(v_booking.external_id, ':match:', 2);
    IF v_match_id <> '' THEN
      BEGIN
        PERFORM public.unschedule_champ_match(v_match_id::uuid);
      EXCEPTION WHEN OTHERS THEN
        UPDATE public.bookings SET status = 'cancelled' WHERE id = p_booking_id;
      END;
    ELSE
      UPDATE public.bookings SET status = 'cancelled' WHERE id = p_booking_id;
    END IF;
  ELSE
    UPDATE public.bookings SET status = 'cancelled' WHERE id = p_booking_id;
  END IF;

  RETURN jsonb_build_object('bookingId', p_booking_id, 'status', 'cancelled');
END;
$$;

REVOKE ALL ON FUNCTION public.mobile_booking_cancel(text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mobile_booking_cancel(text, uuid, uuid, uuid) TO anon, authenticated, service_role;
