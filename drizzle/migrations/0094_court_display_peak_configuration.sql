CREATE OR REPLACE FUNCTION public.court_display_board(_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _club uuid; _today date := (now() AT TIME ZONE 'Africa/Johannesburg')::date; _res jsonb;
BEGIN
  SELECT club_id INTO _club FROM court_display_tokens WHERE token = _token AND revoked_at IS NULL;
  IF _club IS NULL THEN RETURN NULL; END IF;
  SELECT jsonb_build_object(
    'club', (SELECT jsonb_build_object('name', c.name, 'logo_url', c.logo_url, 'slot_minutes', c.booking_slot_minutes, 'open_time', c.booking_open_time, 'last_slot_time', c.booking_last_slot_time,
      'peak_weekday_start', c.peak_weekday_start, 'peak_weekday_end', c.peak_weekday_end,
      'peak_weekend_start', c.peak_weekend_start, 'peak_weekend_end', c.peak_weekend_end,
      'peak_day_overrides', c.peak_day_overrides) FROM clubs c WHERE c.id = _club),
    'date', _today,
    'courts', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'name', name) ORDER BY name, id) FROM courts WHERE club_id = _club AND COALESCE(active,true) AND NOT COALESCE(is_external,false)), '[]'::jsonb),
    'bookings', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'court_id', b.court_id, 'start', b.start_time, 'end', b.end_time, 'type', b.booking_type,
        'label', COALESCE(ev.title, NULLIF(b.ops_purpose,''),
          NULLIF(concat_ws(' vs ',
            NULLIF(regexp_replace(trim(COALESCE(m.name, b.external_booker_name, b.guest_name,'')), '^(\S+)\s+.*?(\S)\S*$', '\1 \2.'),''),
            NULLIF(regexp_replace(trim(COALESCE(o.name,'')), '^(\S+)\s+.*?(\S)\S*$', '\1 \2.'),'')),''), 'Booked')
      ) ORDER BY b.start_time)
      FROM bookings b
      LEFT JOIN club_members m ON m.id = b.club_member_id
      LEFT JOIN club_members o ON o.id = b.opponent_member_id
      LEFT JOIN club_events ev ON ev.id = b.event_id
      WHERE b.club_id = _club AND b.date = _today AND b.status <> 'cancelled'), '[]'::jsonb)
  ) INTO _res;
  RETURN _res;
END $function$;