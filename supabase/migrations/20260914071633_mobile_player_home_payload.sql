CREATE OR REPLACE FUNCTION public.mobile_player_home_payload(
  p_sync_secret text,
  p_club_id uuid,
  p_member_id uuid,
  p_from date DEFAULT CURRENT_DATE,
  p_to date DEFAULT CURRENT_DATE + 7
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_member public.club_members%ROWTYPE;
  v_club public.clubs%ROWTYPE;
  v_courts jsonb;
  v_bookings jsonb;
  v_players jsonb;
  v_devices jsonb;
  v_has_access_device boolean;
  v_has_light_device boolean;
  v_has_court_relay boolean;
  v_member_status text;
  v_member_role text;
  v_is_access_suspended boolean;
  v_can_book_court boolean;
  v_can_use_door boolean;
BEGIN
  IF NOT public.mobile_internal_secret_ok(p_sync_secret) THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_member
  FROM public.club_members
  WHERE id = p_member_id
    AND club_id = p_club_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member does not belong to selected club' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_club
  FROM public.clubs
  WHERE id = p_club_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Club not found' USING ERRCODE = 'P0002';
  END IF;

  v_member_status := lower(COALESCE(v_member.status::text, ''));
  v_member_role := lower(COALESCE(v_member.role::text, ''));
  v_is_access_suspended := v_member.access_suspended_at IS NOT NULL
    OR v_member.suspended_at IS NOT NULL
    OR COALESCE(v_member.suspension_manual, false)
    OR COALESCE(v_member.suspension_status::text, '') NOT IN ('', 'active', 'clear', 'none', 'not_suspended');

  v_can_book_court := NOT v_is_access_suspended
    AND v_member_status NOT IN ('cancelled', 'inactive', 'suspended', 'rejected', 'archived', 'resigned')
    AND (
      v_member_role <> 'visitor'
      OR COALESCE(v_club.visitors_can_book, false)
    );

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'name', c.name,
      'venue_name', c.venue_name,
      'club_id', c.club_id,
      'is_external', c.is_external,
      'relay_device_id', c.relay_device_id,
      'relay_server', c.relay_server,
      'relay_channel', c.relay_channel,
      'relay_ble_mac', c.relay_ble_mac,
      'fluss_device_id', c.fluss_device_id
    )
    ORDER BY c.id
  ), '[]'::jsonb)
  INTO v_courts
  FROM public.courts c
  WHERE c.club_id = p_club_id
    AND COALESCE(c.is_external, false) = false;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', b.id,
      'club_id', b.club_id,
      'club_member_id', b.club_member_id,
      'player_member_id', b.club_member_id,
      'player_name', booker.name,
      'court_id', b.court_id,
      'court_name', court.name,
      'court_type', COALESCE(court.venue_name, 'Court'),
      'date', b.date,
      'start_time', b.start_time,
      'end_time', b.end_time,
      'status', b.status,
      'booking_type', b.booking_type,
      'is_friendly', b.is_friendly,
      'guest_name', b.guest_name,
      'opponent_member_id', COALESCE(b.opponent_member_id, b.opponent_id),
      'opponent_name', opponent.name,
      'source', b.source,
      'external_id', b.external_id,
      'challenge_id', b.challenge_id,
      'lights_requested', b.lights_requested,
      'light_fee_split', b.light_fee_split,
      'light_status', CASE
        WHEN b.lights_requested AND b.shelly_schedule_on_id IS NOT NULL AND b.shelly_schedule_off_id IS NOT NULL THEN 'scheduled'
        WHEN b.lights_requested THEN 'requested'
        ELSE 'not_requested'
      END,
      'created_at', b.created_at
    )
    ORDER BY b.date, b.start_time
  ), '[]'::jsonb)
  INTO v_bookings
  FROM public.bookings b
  LEFT JOIN public.courts court ON court.id = b.court_id
  LEFT JOIN public.club_members booker ON booker.id = b.club_member_id
  LEFT JOIN public.club_members opponent ON opponent.id = COALESCE(b.opponent_member_id, b.opponent_id)
  WHERE b.club_id = p_club_id
    AND b.date >= COALESCE(p_from, CURRENT_DATE)
    AND b.date <= COALESCE(p_to, CURRENT_DATE + 7)
    AND lower(COALESCE(b.status, '')) <> 'cancelled';

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'sourceMemberId', cm.id,
      'clubId', cm.club_id,
      'sourceUserId', cm.user_id,
      'personId', cm.person_id,
      'name', cm.name,
      'email', cm.email,
      'role', cm.role,
      'status', cm.status,
      'clubMemberNumber', cm.club_member_number,
      'rankingPoints', cm.ranking_points,
      'ladderPosition', cm.ladder_position,
      'homeClubName', COALESCE(cm.home_club_name, v_club.name),
      'skillLevel', cm.skill_level,
      'avatarUrl', cm.avatar_url,
      'sourceUpdatedAt', cm.updated_at
    )
    ORDER BY cm.ladder_position NULLS LAST, cm.name NULLS LAST
  ), '[]'::jsonb)
  INTO v_players
  FROM public.club_members cm
  WHERE cm.club_id = p_club_id
    AND lower(COALESCE(cm.role::text, '')) <> 'visitor'
    AND lower(COALESCE(cm.status::text, '')) NOT IN ('cancelled', 'inactive', 'suspended', 'rejected', 'archived', 'resigned')
  LIMIT 200;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', cd.id,
      'club_id', cd.club_id,
      'category', cd.category,
      'provider', cd.provider,
      'enabled', cd.enabled,
      'show_on_dashboard', cd.show_on_dashboard,
      'name', cd.name,
      'location', cd.location,
      'shelly_device_id', cd.shelly_device_id,
      'shelly_channel', cd.shelly_channel,
      'control_mode', cd.control_mode,
      'pulse_ms', cd.pulse_ms
    )
    ORDER BY cd.sort_order, cd.name
  ), '[]'::jsonb)
  INTO v_devices
  FROM public.club_devices cd
  WHERE cd.club_id = p_club_id
    AND cd.enabled = true
    AND lower(COALESCE(cd.provider, '')) = 'shelly'
    AND lower(COALESCE(cd.category, '')) IN ('access', 'lights');

  SELECT EXISTS (
    SELECT 1
    FROM public.club_devices cd
    WHERE cd.club_id = p_club_id
      AND cd.enabled = true
      AND lower(COALESCE(cd.provider, '')) = 'shelly'
      AND lower(COALESCE(cd.category, '')) = 'access'
      AND cd.shelly_device_id IS NOT NULL
      AND cd.show_on_dashboard IS DISTINCT FROM false
  )
  INTO v_has_access_device;

  SELECT EXISTS (
    SELECT 1
    FROM public.club_devices cd
    WHERE cd.club_id = p_club_id
      AND cd.enabled = true
      AND lower(COALESCE(cd.provider, '')) = 'shelly'
      AND lower(COALESCE(cd.category, '')) = 'lights'
      AND cd.shelly_device_id IS NOT NULL
  )
  INTO v_has_light_device;

  SELECT EXISTS (
    SELECT 1
    FROM public.courts c
    WHERE c.club_id = p_club_id
      AND COALESCE(c.is_external, false) = false
      AND c.relay_device_id IS NOT NULL
  )
  INTO v_has_court_relay;

  v_can_use_door := v_has_access_device
    AND NOT v_is_access_suspended
    AND v_member_status NOT IN ('cancelled', 'inactive', 'suspended', 'rejected', 'archived', 'resigned');

  RETURN jsonb_build_object(
    'club', jsonb_build_object(
      'id', v_club.id,
      'name', v_club.name,
      'logo_url', v_club.logo_url,
      'currency_code', v_club.currency_code,
      'currency_symbol', v_club.currency_symbol,
      'participation_active', v_club.participation_active,
      'visitors_can_book', v_club.visitors_can_book,
      'booking_open_time', v_club.booking_open_time,
      'booking_last_slot_time', v_club.booking_last_slot_time,
      'booking_slot_minutes', v_club.booking_slot_minutes,
      'peak_weekday_start', v_club.peak_weekday_start,
      'peak_weekday_end', v_club.peak_weekday_end,
      'peak_weekend_start', v_club.peak_weekend_start,
      'peak_weekend_end', v_club.peak_weekend_end,
      'max_peak_bookings_per_day', v_club.max_peak_bookings_per_day,
      'max_bookings_per_day', v_club.max_bookings_per_day,
      'block_back_to_back_bookings', v_club.block_back_to_back_bookings,
      'lights_integration_enabled', v_club.lights_integration_enabled,
      'light_fee_per_hour', v_club.light_fee_per_hour,
      'external_booking_provider', v_club.external_booking_provider,
      'external_booking_url', v_club.external_booking_url,
      'external_booking_label', v_club.external_booking_label,
      'uses_gobook', v_club.uses_gobook,
      'gobook_url', v_club.gobook_url,
      'gobook_api_enabled', v_club.gobook_api_enabled
    ),
    'courts', v_courts,
    'bookings', v_bookings,
    'players', v_players,
    'devices', v_devices,
    'access', jsonb_build_object(
      'door', v_can_use_door,
      'courtLights', (COALESCE(v_club.lights_integration_enabled, false) AND (v_has_light_device OR v_has_court_relay))
    ),
    'permissions', jsonb_build_object(
      'clubId', p_club_id,
      'memberId', p_member_id,
      'role', v_member.role,
      'status', v_member.status,
      'canBookCourt', v_can_book_court,
      'canUseDoor', v_can_use_door,
      'canSeeLightsStatus', COALESCE(v_club.lights_integration_enabled, false) AND (v_has_light_device OR v_has_court_relay),
      'accessSuspended', v_is_access_suspended
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mobile_player_home_payload(text, uuid, uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mobile_player_home_payload(text, uuid, uuid, date, date) TO anon, authenticated, service_role;
