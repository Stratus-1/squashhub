-- Organiser-controlled whole-draw deletion: removes every fixture, round and division
-- of a tournament so a fresh draw can be generated later. Entries and the saved
-- structure (builder_spec) are kept. Refused when any game is played/started or has
-- a court booking. Audited.
CREATE OR REPLACE FUNCTION public.delete_tournament_draw(p_champ_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  n_games int; n_played int; n_booked int; n_rounds int; v_club uuid;
BEGIN
  IF NOT public.can_manage_tournament(auth.uid(), p_champ_id) THEN
    RAISE EXCEPTION 'Not allowed to manage this tournament' USING ERRCODE = '42501';
  END IF;
  SELECT club_id INTO v_club FROM public.tournaments WHERE id = p_champ_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unknown tournament';
  END IF;

  SELECT count(*),
         count(*) FILTER (WHERE winner_member_id IS NOT NULL
            OR COALESCE(lower(status),'') IN ('completed','confirmed','in_progress','live','walkover','forfeit')
            OR COALESCE(side_a_points,0) > 0 OR COALESCE(side_b_points,0) > 0),
         count(*) FILTER (WHERE booking_id IS NOT NULL)
    INTO n_games, n_played, n_booked
    FROM public.club_champs_matches WHERE champ_id = p_champ_id;

  IF n_games = 0 THEN
    RAISE EXCEPTION 'no_draw: this tournament has no saved games to delete';
  END IF;
  IF n_played > 0 THEN
    RAISE EXCEPTION 'results_exist: % game(s) are played or started. A draw with results cannot be deleted.', n_played;
  END IF;
  IF n_booked > 0 THEN
    RAISE EXCEPTION 'bookings_exist: % game(s) have court bookings. Cancel those bookings first, then delete the draw.', n_booked;
  END IF;

  DELETE FROM public.champ_result_notifications n
    USING public.club_champs_matches m
    WHERE n.match_id = m.id AND m.champ_id = p_champ_id;
  DELETE FROM public.match_disputes d
    USING public.club_champs_matches m
    WHERE d.match_id = m.id AND m.champ_id = p_champ_id;
  DELETE FROM public.match_correction_requests c
    USING public.club_champs_matches m
    WHERE c.match_id = m.id AND m.champ_id = p_champ_id;
  -- champ_marker_locks.match_id cascades with the matches.
  DELETE FROM public.club_champs_matches WHERE champ_id = p_champ_id;
  DELETE FROM public.club_champs_rounds WHERE champ_id = p_champ_id;
  GET DIAGNOSTICS n_rounds = ROW_COUNT;
  DELETE FROM public.tournament_divisions WHERE tournament_id = p_champ_id;

  INSERT INTO public.audit_events (club_id, actor_user_id, entity_type, entity_id, action, reason, before_data)
  VALUES (v_club, auth.uid(), 'tournament', p_champ_id, 'delete_draw',
          'Organiser deleted the draw to redo it',
          jsonb_build_object('games', n_games, 'rounds', n_rounds));

  RETURN jsonb_build_object('deleted_games', n_games, 'deleted_rounds', n_rounds);
END
$function$;
REVOKE ALL ON FUNCTION public.delete_tournament_draw(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_tournament_draw(uuid) TO authenticated;