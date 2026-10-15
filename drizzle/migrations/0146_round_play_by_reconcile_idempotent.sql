CREATE OR REPLACE FUNCTION public.admin_set_round_play_by(p_round_id uuid, p_play_by date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  r public.club_champs_rounds%ROWTYPE; v_club uuid; v_name text; v_was_club boolean; m RECORD; b public.bookings%ROWTYPE;
  v_released int := 0; v_updated int := 0; v_notified int := 0; v_kept int := 0; v_changed boolean; v_clear boolean; v_mode text; p uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'You must be signed in' USING ERRCODE = '42501'; END IF;
  IF p_play_by IS NULL THEN RAISE EXCEPTION 'Choose a play-by date' USING ERRCODE = '22023'; END IF;
  SELECT * INTO r FROM public.club_champs_rounds WHERE id = p_round_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Round not found' USING ERRCODE = 'P0002'; END IF;
  SELECT club_id, name INTO v_club, v_name FROM public.club_champs WHERE id = r.champ_id;
  IF NOT public.is_club_admin_or_permitted(auth.uid(), v_club, 'champs') THEN
    RAISE EXCEPTION 'Only an organiser can change round scheduling' USING ERRCODE = '42501';
  END IF;
  v_was_club := COALESCE(r.scheduling_mode, 'self') = 'club';
  v_mode := COALESCE(public._champ_draw_notice_mode(r.champ_id), 'prompt');

  UPDATE public.club_champs_rounds SET scheduling_mode = 'self', play_by = p_play_by
   WHERE id = p_round_id AND (scheduling_mode IS DISTINCT FROM 'self' OR play_by IS DISTINCT FROM p_play_by);

  PERFORM set_config('app.self_schedule', '1', true);
  FOR m IN
    SELECT * FROM public.club_champs_matches
     WHERE round_id = p_round_id AND NOT COALESCE(is_bye, false)
       AND COALESCE(status, 'scheduled') NOT IN ('completed','in_progress','forfeited','walkover','cancelled')
     FOR UPDATE
  LOOP
    v_clear := false;
    IF m.booking_id IS NOT NULL THEN
      SELECT * INTO b FROM public.bookings WHERE id = m.booking_id;
      IF v_was_club AND b.id IS NOT NULL AND b.external_id = 'champ:' || m.champ_id::text || ':match:' || m.id::text THEN
        -- Organiser-allocated booking for this match only; block holds it used are restored, never cancelled.
        UPDATE public.bookings SET status = 'cancelled' WHERE id = b.id;
        UPDATE public.bookings h SET status = 'active',
               ops_note = coalesce(h.ops_note || ' | ', '') || 'Restored after match ' || m.id::text || ' moved to play-by date'
         WHERE h.status = 'cancelled' AND h.club_id = b.club_id
           AND h.ops_note LIKE '%Released for tournament match ' || m.id::text || '%'
           AND h.ops_note NOT LIKE '%Restored after match ' || m.id::text || '%'
           AND btrim(coalesce(h.external_booker_name, '')) ILIKE 'club championship%'
           AND h.date >= current_date
           AND NOT EXISTS (SELECT 1 FROM public.bookings x WHERE x.court_id = h.court_id AND x.date = h.date AND x.status = 'active'
                            AND x.id <> h.id AND x.start_time < h.end_time AND x.end_time > h.start_time);
        v_clear := true;
      ELSIF b.id IS NULL OR b.status <> 'active' THEN
        v_clear := true; -- dangling link
      ELSE
        v_kept := v_kept + 1; -- players' own booking for a play-by round: keep it
      END IF;
    ELSIF m.scheduled_date IS NOT NULL OR m.scheduled_time IS NOT NULL OR m.court_id IS NOT NULL THEN
      v_clear := true; -- unbooked draw/schedule allocation
    END IF;

    v_changed := v_clear OR m.play_by IS DISTINCT FROM p_play_by;
    IF v_clear THEN
      UPDATE public.club_champs_matches SET court_id = NULL, scheduled_date = NULL, scheduled_time = NULL, booking_id = NULL,
             play_by = p_play_by, updated_at = now() WHERE id = m.id;
      v_released := v_released + 1;
    ELSIF m.play_by IS DISTINCT FROM p_play_by THEN
      UPDATE public.club_champs_matches SET play_by = p_play_by, updated_at = now() WHERE id = m.id;
    END IF;
    IF v_changed THEN v_updated := v_updated + 1; END IF;

    -- Material change + player already had the draw notice + notices not Off -> one schedule-change notice.
    IF v_changed AND m.draw_notice_state = 'sent' AND v_mode <> 'off' AND m.player_a_member_id IS NOT NULL AND m.player_b_member_id IS NOT NULL THEN
      FOREACH p IN ARRAY array_remove(ARRAY[m.player_a_member_id, m.player_b_member_id, m.partner_a_member_id, m.partner_b_member_id], NULL) LOOP
        INSERT INTO public.notifications (club_member_id, title, message, type, url, data, read)
        VALUES (p, 'Match schedule changed', coalesce(v_name, 'Tournament') || ' — ' || coalesce(nullif(r.label, ''), 'Round ' || r.round_number)
                || ': arrange your match with your opponent and play by ' || to_char(p_play_by, 'DD Mon YYYY') || '.',
                'tournament_schedule_change', '/tournaments',
                jsonb_build_object('champ_id', r.champ_id, 'match_id', m.id, 'play_by', p_play_by), false);
        v_notified := v_notified + 1;
      END LOOP;
    END IF;
  END LOOP;
  PERFORM set_config('app.self_schedule', '', true);

  RETURN jsonb_build_object('round_id', p_round_id, 'matches', v_updated, 'released', v_released, 'kept_player_bookings', v_kept, 'notified', v_notified);
END $$;