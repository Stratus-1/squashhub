-- Season fixtures may be stored without season_id, under the platform association mirrored by the season's association.
CREATE OR REPLACE FUNCTION public.md_season_fixtures(_season uuid)
RETURNS SETOF public.platform_league_fixtures
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT f.* FROM platform_league_fixtures f
  WHERE f.season_id = _season
  UNION
  SELECT f.* FROM league_seasons s
  LEFT JOIN league_associations la ON la.id = s.association_id
  JOIN platform_league_fixtures f
    ON f.season_id IS NULL
   AND f.association_id IN (s.association_id, s.platform_association_id, la.platform_association_id)
   AND extract(year FROM f.fixture_date)::int = s.season_year
  WHERE s.id = _season
$$;
REVOKE ALL ON FUNCTION public.md_season_fixtures(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.md_window(_kind text, _id uuid, OUT starts_on date, OUT ends_on date)
RETURNS record LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF _kind = 'tournament' THEN
    SELECT LEAST(min(c.start_date), min(m.scheduled_date), min(m.play_by)), GREATEST(max(c.end_date), max(c.playoff_date), max(m.scheduled_date), max(m.play_by))
      INTO starts_on, ends_on
      FROM club_champs c LEFT JOIN club_champs_matches m ON m.champ_id = c.id WHERE c.id = _id;
  ELSE
    SELECT s.starts_on, s.ends_on INTO starts_on, ends_on FROM league_seasons s WHERE s.id = _id;
    SELECT COALESCE(starts_on, min(f.fixture_date)), GREATEST(ends_on, max(f.fixture_date))
      INTO starts_on, ends_on FROM public.md_season_fixtures(_id) f;
  END IF;
  starts_on := COALESCE(starts_on, CURRENT_DATE) - 7;
  ends_on := COALESCE(ends_on, CURRENT_DATE) + 2;
END $function$;

CREATE OR REPLACE FUNCTION public.md_context(_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE a match_day_access := public.md_resolve(_token); w record; _name text; _club_name text; _sub text; _matches jsonb; _courts jsonb; _extra jsonb := '{}'::jsonb;
BEGIN
  IF a.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'invalid'); END IF;
  SELECT * INTO w FROM public.md_window(a.competition_kind, a.competition_id);
  SELECT name, subdomain INTO _club_name, _sub FROM clubs WHERE id = a.club_id;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) ORDER BY id), '[]') INTO _courts FROM courts WHERE club_id = a.club_id AND coalesce(active,true);
  IF a.competition_kind = 'tournament' THEN
    SELECT name INTO _name FROM club_champs WHERE id = a.competition_id;
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id, 'date', m.scheduled_date, 'time', m.scheduled_time, 'court_id', m.court_id,
      'status', m.status, 'score', m.score, 'game_scores', m.game_scores,
      'group', coalesce(m.pool_number, m.group_number), 'round', m.round_number, 'stage', coalesce(m.stage_label, m.stage),
      'side_a', coalesce(nullif(concat_ws(' & ', pa.name, qa.name),''), m.placeholder_a),
      'side_b', coalesce(nullif(concat_ws(' & ', pb.name, qb.name),''), m.placeholder_b),
      'winner', CASE WHEN m.winner_member_id IS NULL THEN NULL WHEN m.winner_member_id IN (m.player_a_member_id, m.partner_a_member_id) THEN 'a' ELSE 'b' END,
      'scorable', m.status NOT IN ('completed','placeholder') AND coalesce(m.is_bye,false) = false AND m.player_a_member_id IS NOT NULL AND m.player_b_member_id IS NOT NULL
    ) ORDER BY m.scheduled_date NULLS LAST, m.scheduled_time NULLS LAST, m.court_id), '[]')
    INTO _matches
    FROM club_champs_matches m
    LEFT JOIN club_members pa ON pa.id = m.player_a_member_id LEFT JOIN club_members qa ON qa.id = m.partner_a_member_id
    LEFT JOIN club_members pb ON pb.id = m.player_b_member_id LEFT JOIN club_members qb ON qb.id = m.partner_b_member_id
    WHERE m.champ_id = a.competition_id AND m.status <> 'placeholder';
    SELECT jsonb_build_object('best_of', coalesce(best_of,5)) INTO _extra FROM club_champs WHERE id = a.competition_id;
  ELSE
    SELECT coalesce(la.name || ' ', '') || coalesce(s.label, s.season_year::text) INTO _name
      FROM league_seasons s LEFT JOIN league_associations la ON la.id = s.association_id WHERE s.id = a.competition_id;
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', f.id, 'date', f.fixture_date, 'time', f.start_time, 'court_id', f.court_id, 'division', f.division,
      'status', coalesce(r.status, f.status), 'score', f.score,
      'side_a', coalesce(f.home_team_name_snapshot, f.home_team_code), 'side_b', coalesce(f.away_team_name_snapshot, f.away_team_code),
      'totals', CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object('home_games', r.home_total_games, 'away_games', r.away_total_games, 'home_points', r.home_total_points, 'away_points', r.away_total_points, 'winner', r.winner) END,
      'scorable', coalesce(r.status,'') NOT IN ('submitted','completed'),
      'rubbers', (SELECT coalesce(jsonb_agg(jsonb_build_object('position', x.position, 'home', concat_ws(' & ', x.home_player_name, x.home_player2_name), 'away', concat_ws(' & ', x.away_player_name, x.away_player2_name), 'game_scores', x.game_scores, 'home_won', x.home_games_won, 'away_won', x.away_games_won, 'winner', x.winner) ORDER BY x.position), '[]') FROM league_match_results x WHERE x.fixture_id = f.id)
    ) ORDER BY f.fixture_date, f.start_time NULLS LAST, f.court_id), '[]')
    INTO _matches
    FROM public.md_season_fixtures(a.competition_id) f LEFT JOIN league_fixture_results r ON r.fixture_id = f.id
    WHERE (f.court_id IS NULL OR f.court_id IN (SELECT id FROM courts WHERE club_id = a.club_id));
  END IF;
  RETURN jsonb_build_object('ok', true, 'kind', a.competition_kind, 'name', _name, 'club_name', _club_name, 'subdomain', _sub,
    'starts_on', w.starts_on, 'ends_on', w.ends_on, 'scoring_open', CURRENT_DATE BETWEEN w.starts_on AND w.ends_on,
    'courts', _courts, 'matches', _matches, 'settings', _extra);
END $function$;

CREATE OR REPLACE FUNCTION public.md_save_league_rubber(_token text, _court integer, _fixture_id uuid, _position integer, _game_scores jsonb, _device text DEFAULT NULL::text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE a match_day_access := public.md_resolve(_token); w record; f platform_league_fixtures; r league_fixture_results; x league_match_results; hw int := 0; aw int := 0; g jsonb; _label text;
BEGIN
  IF a.id IS NULL OR a.competition_kind <> 'league_season' THEN RAISE EXCEPTION 'This scoring link is not valid' USING ERRCODE='42501'; END IF;
  SELECT * INTO w FROM public.md_window(a.competition_kind, a.competition_id);
  IF CURRENT_DATE NOT BETWEEN w.starts_on AND w.ends_on THEN RAISE EXCEPTION 'Scoring is closed for this competition' USING ERRCODE='42501'; END IF;
  SELECT * INTO f FROM public.md_season_fixtures(a.competition_id) sf WHERE sf.id=_fixture_id;
  IF f.id IS NULL OR (f.court_id IS NOT NULL AND f.court_id NOT IN (SELECT id FROM courts WHERE club_id=a.club_id)) THEN RAISE EXCEPTION 'Fixture not part of this competition' USING ERRCODE='42501'; END IF;
  IF _court IS NOT NULL AND f.court_id IS DISTINCT FROM _court THEN RAISE EXCEPTION 'This fixture is not on this court' USING ERRCODE='42501'; END IF;
  SELECT * INTO r FROM league_fixture_results WHERE fixture_id=f.id;
  IF r.status IN ('submitted','completed') OR coalesce(r.totals_locked,false) THEN RAISE EXCEPTION 'This fixture has been submitted' USING ERRCODE='42501'; END IF;
  SELECT * INTO x FROM league_match_results WHERE fixture_id=f.id AND position=_position FOR UPDATE;
  IF x.id IS NULL OR coalesce(x.home_player_name,'')='' OR coalesce(x.away_player_name,'')='' THEN RAISE EXCEPTION 'The captains must set the line-up first' USING ERRCODE='22023'; END IF;
  IF jsonb_typeof(_game_scores) <> 'array' OR jsonb_array_length(_game_scores) = 0 THEN RAISE EXCEPTION 'Enter at least one game' USING ERRCODE='22023'; END IF;
  FOR g IN SELECT * FROM jsonb_array_elements(_game_scores) LOOP
    IF (g->>'home')::int > (g->>'away')::int THEN hw := hw+1; ELSIF (g->>'away')::int > (g->>'home')::int THEN aw := aw+1; ELSE RAISE EXCEPTION 'A game cannot be a tie' USING ERRCODE='22023'; END IF;
  END LOOP;
  UPDATE league_match_results SET game_scores=_game_scores, home_games_won=hw, away_games_won=aw,
    winner = CASE WHEN hw>aw THEN 'home' ELSE 'away' END, participants_locked_at = coalesce(participants_locked_at, now()), updated_at=now()
  WHERE id=x.id;
  _label := 'Match Day Access (' || CASE WHEN _court IS NULL THEN 'all courts' ELSE 'Court ' || _court END || ')';
  INSERT INTO audit_events (club_id, actor_label, entity_type, entity_id, action, before_data, after_data)
  VALUES (a.club_id, _label, 'league_match_result', x.id, 'match_day_rubber', jsonb_build_object('game_scores', x.game_scores), jsonb_build_object('game_scores',_game_scores,'access_id',a.id,'device',left(_device,200)));
  RETURN jsonb_build_object('ok', true, 'home_won', hw, 'away_won', aw);
END $function$;