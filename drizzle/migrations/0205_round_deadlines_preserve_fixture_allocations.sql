CREATE OR REPLACE FUNCTION public.admin_set_round_play_by(p_round_id uuid, p_play_by date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  r public.club_champs_rounds%ROWTYPE;
  v_club uuid;
  v_updated integer := 0;
  v_kept integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'You must be signed in' USING ERRCODE='42501'; END IF;
  IF p_play_by IS NULL THEN RAISE EXCEPTION 'Choose a play-by date' USING ERRCODE='22023'; END IF;
  SELECT * INTO r FROM public.club_champs_rounds WHERE id=p_round_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Round not found' USING ERRCODE='P0002'; END IF;
  SELECT club_id INTO v_club FROM public.club_champs WHERE id=r.champ_id;
  IF NOT public.is_club_admin_or_permitted(auth.uid(),v_club,'champs') THEN
    RAISE EXCEPTION 'Only an organiser can change round scheduling' USING ERRCODE='42501';
  END IF;
  UPDATE public.club_champs_rounds SET scheduling_mode='self',play_by=p_play_by
  WHERE id=p_round_id AND (scheduling_mode IS DISTINCT FROM 'self' OR play_by IS DISTINCT FROM p_play_by);
  SELECT count(*) INTO v_kept FROM public.club_champs_matches
  WHERE round_id=p_round_id AND NOT COALESCE(is_bye,false)
    AND COALESCE(status,'scheduled') NOT IN ('completed','in_progress','forfeited','walkover','cancelled')
    AND (booking_id IS NOT NULL OR scheduled_date IS NOT NULL OR scheduled_time IS NOT NULL OR court_id IS NOT NULL);
  -- Deadline/setup reconciliation is not a cancellation or reschedule instruction.
  -- Preserve every existing court allocation and booking; explicit fixture actions own those changes.
  PERFORM set_config('app.self_schedule','1',true);
  UPDATE public.club_champs_matches SET play_by=p_play_by,updated_at=now()
  WHERE round_id=p_round_id AND NOT COALESCE(is_bye,false)
    AND COALESCE(status,'scheduled') NOT IN ('completed','in_progress','forfeited','walkover','cancelled')
    AND play_by IS DISTINCT FROM p_play_by;
  GET DIAGNOSTICS v_updated=ROW_COUNT;
  PERFORM set_config('app.self_schedule','',true);
  RETURN jsonb_build_object('round_id',p_round_id,'matches',v_updated,'released',0,'kept_player_bookings',v_kept,'notified',0);
END;
$function$;