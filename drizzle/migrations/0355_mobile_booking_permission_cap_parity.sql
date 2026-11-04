-- Player booking cap parity only. Abort atomically if either reviewed live RPC has drifted.
DO $migration$
DECLARE
  v_ready text := pg_get_functiondef('public.mobile_booking_assert_ready(text,uuid,uuid,integer,date,time,integer,uuid,uuid,text)'::regprocedure);
  v_availability text := pg_get_functiondef('public.mobile_booking_availability(text,uuid,uuid,date)'::regprocedure);
BEGIN
  IF md5(btrim(v_ready, E' \n\r\t')) <> 'f7ffb23649dbd2aee2aa12178c752d17'
    OR md5(btrim(v_availability, E' \n\r\t')) <> 'feb492d0ebd381fd7d23b1231c7d46bf' THEN
    RAISE EXCEPTION 'Player booking RPC definitions differ from the reviewed live versions; re-audit before applying';
  END IF;
  IF to_regprocedure('public.is_club_admin_or_permitted(uuid,uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'Existing web permission helper is missing';
  END IF;

  v_ready := replace(v_ready, '  v_open_minutes integer;', '  v_open_minutes integer;
  v_peak_slot boolean;
  v_limits_bypassed boolean;');
  v_ready := replace(v_ready, '  v_max_daily := GREATEST(1, COALESCE(v_club.max_bookings_per_day, 4));',
  '  -- Web isPeakSlot uses the requested start, inclusive start/exclusive end.
  SELECT * INTO v_peak_window FROM public.club_peak_window(v_club,p_date);
  v_peak_slot := COALESCE(p_start_time >= v_peak_window.peak_start AND p_start_time < v_peak_window.peak_end, false);
  -- Resolve only the booking member''s server-owned identity, never the opponent''s privilege.
  v_limits_bypassed := v_member.user_id IS NOT NULL AND (
    COALESCE(public.is_club_admin_or_permitted(v_member.user_id, p_club_id, ''bookings_unlimited''), false)
    OR (NOT v_peak_slot AND COALESCE(public.is_club_admin_or_permitted(v_member.user_id, p_club_id, ''bookings_unlimited_non_peak''), false))
  );
  -- Like the web, the booking actor''s bypass covers both players'' cap checks only.
  IF NOT v_limits_bypassed THEN
  v_max_daily := GREATEST(1, COALESCE(v_club.max_bookings_per_day, 4));');
  v_ready := replace(v_ready,
    '  IF v_club.max_peak_bookings_per_day IS NOT NULL AND p_start_time < v_peak_window.peak_end AND v_end_time > v_peak_window.peak_start THEN',
    '  IF v_club.max_peak_bookings_per_day IS NOT NULL AND v_peak_slot THEN');
  v_ready := replace(v_ready, '  v_balance := public.mobile_booking_balance_gate(p_club_id, p_member_id);',
    '  END IF; -- cap bypass ends before the existing minimum-balance gate

  v_balance := public.mobile_booking_balance_gate(p_club_id, p_member_id);');

  v_availability := replace(v_availability,
    '  v_now date := (now() AT TIME ZONE ''Africa/Johannesburg'')::date;',
    '  v_now date := (now() AT TIME ZONE ''Africa/Johannesburg'')::date;
  v_unlimited boolean;
  v_unlimited_non_peak boolean;');
  v_availability := replace(v_availability, '  v_dow := extract(dow FROM p_date)::integer;',
    '  v_dow := extract(dow FROM p_date)::integer;
  v_unlimited := v_member.user_id IS NOT NULL AND COALESCE(public.is_club_admin_or_permitted(v_member.user_id, p_club_id, ''bookings_unlimited''), false);
  v_unlimited_non_peak := v_member.user_id IS NOT NULL AND COALESCE(public.is_club_admin_or_permitted(v_member.user_id, p_club_id, ''bookings_unlimited_non_peak''), false);');
  v_availability := replace(v_availability,
    '        slot.t BETWEEN v_window.peak_start AND v_window.peak_end - interval ''1 minute'' AS peak_slot,',
    '        COALESCE(slot.t >= v_window.peak_start AND slot.t < v_window.peak_end, false) AS peak_slot,');
  v_availability := replace(v_availability, '    CROSS JOIN LATERAL (SELECT CASE WHEN NOT g.court_open',
    '    CROSS JOIN LATERAL (SELECT v_unlimited OR (v_unlimited_non_peak AND NOT g.peak_slot) AS limits_bypassed) permission
    CROSS JOIN LATERAL (SELECT CASE WHEN NOT g.court_open');
  v_availability := replace(v_availability, 'WHEN v_club.max_bookings_per_day IS NOT NULL AND', 'WHEN NOT permission.limits_bypassed AND v_club.max_bookings_per_day IS NOT NULL AND');
  v_availability := replace(v_availability, 'WHEN g.peak_slot AND', 'WHEN NOT permission.limits_bypassed AND g.peak_slot AND');
  v_availability := replace(v_availability, 'WHEN COALESCE(v_club.block_back_to_back_bookings,false) AND', 'WHEN NOT permission.limits_bypassed AND COALESCE(v_club.block_back_to_back_bookings,false) AND');

  EXECUTE v_ready;
  EXECUTE v_availability;
END;
$migration$;
-- Preserve existing bridge signatures and secret-gated caller roles; no new public execution.
REVOKE EXECUTE ON FUNCTION public.mobile_booking_assert_ready(text,uuid,uuid,integer,date,time,integer,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mobile_booking_assert_ready(text,uuid,uuid,integer,date,time,integer,uuid,uuid,text) TO anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.mobile_booking_availability(text,uuid,uuid,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mobile_booking_availability(text,uuid,uuid,date) TO anon, authenticated, service_role;
