DO $migration$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef('public.ai_correct_champ_result(uuid,jsonb,boolean,text)'::regprocedure) INTO d;
  d := replace(d,
    'SELECT best_of, points_per_game, play_all_games, scoring_mode INTO c FROM public.club_champs WHERE id = m.champ_id;',
    $replacement$SELECT
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
      INTO c FROM public.tournaments tr LEFT JOIN public.tournament_rules r ON r.tournament_id=tr.id WHERE tr.id=m.champ_id;$replacement$);
  d := replace(d, 'IF COALESCE(c.scoring_mode,''standard'') <> ''standard'' THEN', 'IF COALESCE(c.scoring_mode,''standard'') NOT IN (''standard'',''swiss'') THEN');
  d := replace(d, 'IF i > COALESCE(c.best_of,5) THEN', 'IF COALESCE(c.play_all_games,false) AND i <> COALESCE(c.best_of,5) THEN RAISE EXCEPTION ''Enter all % games'', c.best_of; END IF; IF i > COALESCE(c.best_of,5) THEN');
  EXECUTE d;
END;
$migration$;

CREATE OR REPLACE FUNCTION public.correct_tournament_result(p_match_id uuid, p_games jsonb, p_expected_updated_at timestamptz, p_preview boolean DEFAULT true, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public
AS $function$
DECLARE m public.club_champs_matches; proposed jsonb; v_club uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sign in to correct a result' USING ERRCODE='42501'; END IF;
  SELECT * INTO m FROM public.club_champs_matches WHERE id=p_match_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Match not found'; END IF;
  IF NOT public.can_manage_tournament(auth.uid(),m.champ_id) THEN RAISE EXCEPTION 'Only authorised tournament managers can correct this result' USING ERRCODE='42501'; END IF;
  IF m.status <> 'completed' OR coalesce(m.is_bye,false) OR m.forfeit_member_id IS NOT NULL THEN RAISE EXCEPTION 'Only completed played games can be corrected'; END IF;
  IF p_expected_updated_at IS NULL OR m.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'This result changed since you opened it. Close and reopen the editor.' USING ERRCODE='40001'; END IF;
  proposed := public.ai_correct_champ_result(p_match_id,p_games,true,p_reason);
  IF p_preview THEN RETURN proposed; END IF;
  IF proposed->>'new_score'=m.score AND NOT coalesce((proposed->>'winner_changes')::boolean,false) THEN
    RETURN jsonb_build_object('match_id',m.id,'new_score',m.score,'unchanged',true);
  END IF;
  IF nullif(btrim(p_reason),'') IS NULL THEN RAISE EXCEPTION 'Enter the reason for this correction'; END IF;
  RETURN public.ai_correct_champ_result(p_match_id,p_games,false,'Organiser correction: ' || left(btrim(p_reason),500));
END;
$function$;
REVOKE ALL ON FUNCTION public.correct_tournament_result(uuid,jsonb,timestamptz,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.correct_tournament_result(uuid,jsonb,timestamptz,boolean,text) TO authenticated,service_role;