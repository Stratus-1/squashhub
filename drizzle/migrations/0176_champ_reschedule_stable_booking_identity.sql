DO $fix$
DECLARE
  d text := pg_get_functiondef('public.self_schedule_champ_match(uuid,integer,date,time without time zone,integer,boolean)'::regprocedure);
  restore_block text;
  old_insert text := E'  INSERT INTO public.bookings (\n    club_id, court_id, user_id, club_member_id, opponent_member_id,';
BEGIN
  IF position('Resolve the stable booking identity before INSERT triggers run' in d) > 0 THEN RETURN; END IF;
  IF position(old_insert in d) = 0 OR position('  UPDATE public.bookings h' in d) = 0 THEN
    RAISE EXCEPTION 'Unexpected self_schedule_champ_match definition; refusing unsafe replacement';
  END IF;
  restore_block := substring(d from position('  UPDATE public.bookings h' in d) for
    position(E'  IF _venue_club = _club_id THEN\n    PERFORM' in d) - position('  UPDATE public.bookings h' in d));
  IF restore_block IS NULL OR length(restore_block) < 100 THEN
    RAISE EXCEPTION 'Reservation restoration block not found';
  END IF;
  d := replace(d, restore_block, '');
  d := replace(d, 'SELECT * INTO _m FROM public.club_champs_matches WHERE id = p_match_id;',
    'SELECT * INTO _m FROM public.club_champs_matches WHERE id = p_match_id FOR UPDATE;');
  d := replace(d, old_insert,
    E'  -- Resolve the stable booking identity before INSERT triggers run.\n  SELECT b.id INTO _booking_id FROM public.bookings b\n   WHERE b.club_id = _venue_club AND b.source = ''club_event''\n     AND b.external_id = _booking_external_id;\n\n  INSERT INTO public.bookings (\n    id, club_id, court_id, user_id, club_member_id, opponent_member_id,');
  d := replace(d, E'    _venue_club, p_court_id, _booker_user, _booker_member, _m.player_b_member_id,',
    E'    coalesce(_booking_id, gen_random_uuid()), _venue_club, p_court_id, _booker_user, _booker_member, _m.player_b_member_id,');
  d := replace(d, E'  RETURNING id INTO _booking_id;\n', E'  RETURNING id INTO _booking_id;\n\n' || restore_block);
  EXECUTE d;
END
$fix$;