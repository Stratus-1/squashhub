CREATE OR REPLACE FUNCTION public.ai_correct_champ_result(p_match_id uuid, p_games jsonb, p_preview boolean DEFAULT true, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  m public.club_champs_matches; c record; t record;
  g jsonb; i int := 0; a int; b int; wa int := 0; wb int := 0; need int;
  v_new_winner uuid; v_new_score text; v_new_gs text; v_old_games jsonb;
  v_is_group boolean; v_ko_started int := 0; v_ko_populated int := 0;
  v_names jsonb; v_blockers text[] := '{}'; v_later_done int := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE='42501'; END IF;
  SELECT * INTO m FROM public.club_champs_matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;
  SELECT id, club_id, name INTO t FROM public.tournaments WHERE id = m.champ_id;
  SELECT
      CASE WHEN m.stage LIKE 'playoff%' AND tr.league_playoff_match_formats->>m.group_number::text IN ('bo3','all3') THEN 3
           WHEN m.stage LIKE 'playoff%' AND tr.league_playoff_match_formats->>m.group_number::text IN ('bo5','all5') THEN 5
           WHEN coalesce(tr.league_scoring_modes->>m.group_number::text, r.scoring_mode, 'standard') = 'first_to_target' THEN 1
           ELSE coalesce((tr.league_best_of->>m.group_number::text)::int,r.best_of,5) END AS best_of,
      CASE WHEN m.stage LIKE 'playoff%' THEN coalesce((tr.league_playoff_points_per_game->>m.group_number::text)::int,(tr.league_points_per_game->>m.group_number::text)::int,r.points_per_game,11)
           ELSE coalesce((tr.league_points_per_game->>m.group_number::text)::int,r.points_per_game,11) END AS points_per_game,
      CASE WHEN m.stage LIKE 'playoff%' AND tr.league_playoff_match_formats->>m.group_number::text IN ('all3','all5') THEN true
           WHEN m.stage LIKE 'playoff%' AND tr.league_playoff_match_formats->>m.group_number::text IN ('bo3','bo5') THEN false
           ELSE coalesce((tr.league_play_all_games->>m.group_number::text)::boolean,r.play_all_games,false) END AS play_all_games,
      coalesce(tr.league_scoring_modes->>m.group_number::text,r.scoring_mode,'standard') AS scoring_mode
      INTO c FROM public.tournaments tr LEFT JOIN public.tournament_rules r ON r.tournament_id=tr.id WHERE tr.id=m.champ_id;
  IF NOT (public.is_platform_admin(auth.uid())
          OR public.is_club_admin_or_permitted(auth.uid(), t.club_id, 'champs')
          OR public.can_manage_tournament(m.champ_id)) THEN
    RAISE EXCEPTION 'You do not have permission to correct results in this tournament' USING ERRCODE='42501';
  END IF;

  IF m.status <> 'completed' OR m.winner_member_id IS NULL THEN v_blockers := array_append(v_blockers, 'This match has no completed result to correct.'); END IF;
  IF COALESCE(m.is_bye,false) OR m.forfeit_member_id IS NOT NULL THEN v_blockers := array_append(v_blockers, 'Byes and forfeits are not corrected by the assistant.'); END IF;
  IF COALESCE(c.scoring_mode,'standard') NOT IN ('standard','swiss') THEN v_blockers := array_append(v_blockers, 'Only standard game-scored matches can be corrected by the assistant (timed/points formats need manual review).'); END IF;

  IF jsonb_typeof(p_games) <> 'array' OR jsonb_array_length(p_games) = 0 THEN RAISE EXCEPTION 'Give every game score, e.g. 11-9, 8-11, ...'; END IF;
  need := COALESCE(c.best_of, 5) / 2 + 1;
  FOR g IN SELECT * FROM jsonb_array_elements(p_games) LOOP
    i := i + 1; a := (g->>'a')::int; b := (g->>'b')::int;
    IF a IS NULL OR b IS NULL OR a < 0 OR b < 0 OR a = b THEN RAISE EXCEPTION 'Game % is not a valid score', i; END IF;
    IF GREATEST(a,b) < COALESCE(c.points_per_game, 11) THEN RAISE EXCEPTION 'Game % (%-%) does not reach % points', i, a, b, COALESCE(c.points_per_game,11); END IF;
    IF GREATEST(a,b) > COALESCE(c.points_per_game,11) AND abs(a-b) <> 2 THEN RAISE EXCEPTION 'Game % (%-%) is not a valid extended game (must be won by 2)', i, a, b; END IF;
    IF NOT COALESCE(c.play_all_games,false) AND (wa >= need OR wb >= need) THEN RAISE EXCEPTION 'Game % was played after the match was already decided', i; END IF;
    IF a > b THEN wa := wa + 1; ELSE wb := wb + 1; END IF;
  END LOOP;
  IF COALESCE(c.play_all_games,false) AND i <> COALESCE(c.best_of,5) THEN RAISE EXCEPTION 'Enter all % games', c.best_of; END IF; IF i > COALESCE(c.best_of,5) THEN RAISE EXCEPTION 'Too many games for best of %', c.best_of; END IF;
  IF NOT COALESCE(c.play_all_games,false) AND wa < need AND wb < need THEN RAISE EXCEPTION 'Nobody has won % games — the match is not complete', need; END IF;

  v_new_winner := CASE WHEN wa > wb THEN m.player_a_member_id ELSE m.player_b_member_id END;
  v_new_score := (SELECT string_agg((x->>'a') || '-' || (x->>'b'), ', ' ORDER BY n) FROM jsonb_array_elements(p_games) WITH ORDINALITY AS e(x, n));
  v_new_gs := jsonb_build_object('sets', (SELECT jsonb_agg(jsonb_build_object('a',(x->>'a')::int,'b',(x->>'b')::int) ORDER BY n) FROM jsonb_array_elements(p_games) WITH ORDINALITY AS e(x, n)))::text;
  BEGIN v_old_games := (m.game_scores::jsonb)->'sets'; EXCEPTION WHEN others THEN v_old_games := NULL; END;

  IF v_new_winner IS DISTINCT FROM m.winner_member_id THEN
    IF current_setting('app.organiser_correction', true) = '1' THEN
      SELECT count(*) INTO v_later_done FROM public.club_champs_matches x
       WHERE x.champ_id = m.champ_id AND x.id <> m.id
         AND x.group_number IS NOT DISTINCT FROM m.group_number
         AND (coalesce(x.round_number,0) > coalesce(m.round_number,0) OR COALESCE(x.stage,'group') NOT IN ('group','pool','league','round_robin'))
         AND (x.status = 'completed' OR x.winner_member_id IS NOT NULL);
      IF v_later_done > 0 THEN
        v_blockers := array_append(v_blockers, format('The correction changes the winner, but %s later game(s) in this category have already been played — manual review required.', v_later_done));
      END IF;
    ELSE
      v_blockers := array_append(v_blockers, 'The correction changes the winner, which affects ranking points, ladder and progression — manual review required.');
    END IF;
  END IF;

  v_is_group := COALESCE(m.stage,'group') IN ('group','pool','league','round_robin');
  IF v_is_group THEN
    SELECT count(*) FILTER (WHERE status='completed' OR score IS NOT NULL OR winner_member_id IS NOT NULL),
           count(*) FILTER (WHERE player_a_member_id IS NOT NULL OR player_b_member_id IS NOT NULL)
      INTO v_ko_started, v_ko_populated
      FROM public.club_champs_matches
     WHERE champ_id = m.champ_id AND COALESCE(stage,'group') NOT IN ('group','pool','league','round_robin')
       AND COALESCE(group_number,0) = COALESCE(m.group_number,0);
    IF v_ko_populated > 0 THEN
      v_blockers := array_append(v_blockers, format('Playoff games have already been drawn from these pools (%s drawn, %s started) — changing game counts could alter pool positions, so manual review is required.', v_ko_populated, v_ko_started));
    END IF;
  END IF;

  SELECT jsonb_object_agg(id, name) INTO v_names FROM public.club_members
   WHERE id IN (m.player_a_member_id, m.player_b_member_id, m.partner_a_member_id, m.partner_b_member_id);

  IF p_preview THEN
    RETURN jsonb_build_object('club_id', t.club_id, 'tournament', t.name, 'match_id', m.id, 'stage', m.stage, 'pool', m.pool_number,
      'round', m.round_number, 'player_a', v_names->>m.player_a_member_id::text, 'player_b', v_names->>m.player_b_member_id::text,
      'partner_a', v_names->>m.partner_a_member_id::text, 'partner_b', v_names->>m.partner_b_member_id::text,
      'old_score', m.score, 'old_games', v_old_games, 'new_score', v_new_score, 'new_games_won', jsonb_build_array(wa, wb),
      'old_winner', v_names->>m.winner_member_id::text, 'new_winner', v_names->>v_new_winner::text,
      'winner_changes', v_new_winner IS DISTINCT FROM m.winner_member_id, 'is_group', v_is_group,
      'playoffs_drawn', v_ko_populated, 'blockers', to_jsonb(v_blockers), 'updated_at', m.updated_at);
  END IF;

  IF array_length(v_blockers,1) > 0 THEN RAISE EXCEPTION 'Not safe to correct: %', array_to_string(v_blockers, ' '); END IF;

  UPDATE public.club_champs_matches SET score = v_new_score, game_scores = v_new_gs, winner_member_id = v_new_winner, updated_at = now() WHERE id = m.id;

  INSERT INTO public.audit_events (club_id, actor_user_id, entity_type, entity_id, action, reason, before_data, after_data)
  VALUES (t.club_id, auth.uid(), 'club_champs_match', m.id, 'ai_correct_result', COALESCE(p_reason, 'AI assistant, confirmed by user'),
    jsonb_build_object('score', m.score, 'game_scores', m.game_scores, 'winner_member_id', m.winner_member_id, 'tournament_id', m.champ_id),
    jsonb_build_object('score', v_new_score, 'game_scores', v_new_gs, 'winner_member_id', v_new_winner, 'tournament_id', m.champ_id,
      'derived', jsonb_build_array('pool standings (games/points difference) recomputed on read', 'member stats cache marked stale'),
      'notifications_sent', false));

  RETURN jsonb_build_object('match_id', m.id, 'old_score', m.score, 'new_score', v_new_score, 'old_game_scores', m.game_scores, 'new_game_scores', v_new_gs, 'winner_member_id', v_new_winner);
END; $function$;

CREATE OR REPLACE FUNCTION public.correct_tournament_result(p_match_id uuid, p_games jsonb, p_expected_updated_at timestamp with time zone, p_preview boolean DEFAULT true, p_reason text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE m public.club_champs_matches; proposed jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to correct a result' USING ERRCODE='42501'; END IF;
  SELECT * INTO m FROM public.club_champs_matches WHERE id=p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;
  IF NOT public.can_manage_tournament(auth.uid(),m.champ_id) THEN RAISE EXCEPTION 'Only authorised tournament managers can correct this result' USING ERRCODE='42501'; END IF;
  IF m.status <> 'completed' OR coalesce(m.is_bye,false) OR m.forfeit_member_id IS NOT NULL THEN RAISE EXCEPTION 'Only completed played games can be corrected'; END IF;
  IF p_expected_updated_at IS NULL OR m.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'This result changed since you opened it. Close and reopen the editor.' USING ERRCODE='40001'; END IF;
  PERFORM set_config('app.organiser_correction','1',true);
  proposed := public.ai_correct_champ_result(p_match_id,p_games,true,p_reason);
  IF p_preview THEN PERFORM set_config('app.organiser_correction','',true); RETURN proposed; END IF;
  IF proposed->>'new_score'=m.score AND NOT coalesce((proposed->>'winner_changes')::boolean,false) THEN
    PERFORM set_config('app.organiser_correction','',true);
    RETURN jsonb_build_object('match_id',m.id,'new_score',m.score,'unchanged',true);
  END IF;
  IF nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Enter the reason for this correction'; END IF;
  proposed := public.ai_correct_champ_result(p_match_id,p_games,false,'Organiser correction: ' || left(btrim(p_reason),500));
  PERFORM set_config('app.organiser_correction','',true);
  RETURN proposed;
END;
$function$;