CREATE OR REPLACE FUNCTION public.admin_set_round_play_by(p_round_id uuid, p_play_by date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r public.club_champs_rounds%ROWTYPE;
  v_club uuid;
  v_updated integer := 0;
  v_kept integer := 0;
  v_released integer := 0;
  v_was_timed boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'You must be signed in' USING ERRCODE='42501'; END IF;
  IF p_play_by IS NULL THEN RAISE EXCEPTION 'Choose a play-by date' USING ERRCODE='22023'; END IF;
  SELECT * INTO r FROM public.club_champs_rounds WHERE id=p_round_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Round not found' USING ERRCODE='P0002'; END IF;
  SELECT club_id INTO v_club FROM public.club_champs WHERE id=r.champ_id;
  IF NOT public.is_club_admin_or_permitted(auth.uid(),v_club,'champs') THEN
    RAISE EXCEPTION 'Only an organiser can change round scheduling' USING ERRCODE='42501';
  END IF;
  v_was_timed := r.scheduling_mode IS DISTINCT FROM 'self';
  UPDATE public.club_champs_rounds SET scheduling_mode='self',play_by=p_play_by
  WHERE id=p_round_id AND (scheduling_mode IS DISTINCT FROM 'self' OR play_by IS DISTINCT FROM p_play_by);

  PERFORM set_config('app.self_schedule','1',true);
  -- Switching a timed round to play-by releases the system/organiser allocations made while it was
  -- timed (SquashHub fixture bookings). Played games, GoBook bookings and rounds that were already
  -- play-by (where players book their own slots) are never touched.
  IF v_was_timed THEN
    WITH rel AS (
      SELECT m.id AS match_id, m.booking_id
      FROM public.club_champs_matches m
      LEFT JOIN public.bookings b ON b.id=m.booking_id
      WHERE m.round_id=p_round_id AND NOT COALESCE(m.is_bye,false)
        AND COALESCE(m.status,'scheduled') NOT IN ('completed','in_progress','forfeited','walkover','cancelled')
        AND m.winner_member_id IS NULL
        AND (m.booking_id IS NULL OR COALESCE(b.source,'squashhub')='club_event')
        AND (m.booking_id IS NOT NULL OR m.scheduled_date IS NOT NULL OR m.scheduled_time IS NOT NULL OR m.court_id IS NOT NULL)
    ), c AS (
      UPDATE public.bookings SET status='cancelled' WHERE id IN (SELECT booking_id FROM rel WHERE booking_id IS NOT NULL) AND status='active' RETURNING id
    )
    UPDATE public.club_champs_matches SET booking_id=NULL, court_id=NULL, scheduled_date=NULL, scheduled_time=NULL, updated_at=now()
    WHERE id IN (SELECT match_id FROM rel);
    GET DIAGNOSTICS v_released=ROW_COUNT;
  END IF;

  SELECT count(*) INTO v_kept FROM public.club_champs_matches
  WHERE round_id=p_round_id AND NOT COALESCE(is_bye,false)
    AND COALESCE(status,'scheduled') NOT IN ('completed','in_progress','forfeited','walkover','cancelled')
    AND booking_id IS NOT NULL;
  UPDATE public.club_champs_matches SET play_by=p_play_by,updated_at=now()
  WHERE round_id=p_round_id AND NOT COALESCE(is_bye,false)
    AND COALESCE(status,'scheduled') NOT IN ('completed','in_progress','forfeited','walkover','cancelled')
    AND play_by IS DISTINCT FROM p_play_by;
  GET DIAGNOSTICS v_updated=ROW_COUNT;
  PERFORM set_config('app.self_schedule','',true);
  RETURN jsonb_build_object('round_id',p_round_id,'matches',v_updated,'released',v_released,'kept_player_bookings',v_kept,'notified',0);
END;
$function$;