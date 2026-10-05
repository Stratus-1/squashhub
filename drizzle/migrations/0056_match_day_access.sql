CREATE TABLE public.match_day_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL,
  competition_kind text NOT NULL CHECK (competition_kind IN ('tournament','league_season')),
  competition_id uuid NOT NULL,
  token text NOT NULL UNIQUE,
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked','superseded')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  regenerated_from uuid
);
CREATE UNIQUE INDEX match_day_access_one_active ON public.match_day_access (competition_kind, competition_id) WHERE status = 'active';
GRANT SELECT ON public.match_day_access TO authenticated;
GRANT ALL ON public.match_day_access TO service_role;
ALTER TABLE public.match_day_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Club admins read match day access" ON public.match_day_access
  FOR SELECT TO authenticated USING (public.is_club_admin(auth.uid(), club_id));

-- Who may manage access for a competition
CREATE OR REPLACE FUNCTION public.md_can_manage(_kind text, _id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _club uuid; _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RETURN NULL; END IF;
  IF _kind = 'tournament' THEN
    SELECT club_id INTO _club FROM club_champs WHERE id = _id;
    IF _club IS NOT NULL AND (public.can_manage_tournament(_uid, _id) OR public.is_club_admin(_uid, _club) OR public.has_role(_uid,'admin'::app_role)) THEN RETURN _club; END IF;
  ELSIF _kind = 'league_season' THEN
    SELECT club_id INTO _club FROM league_seasons WHERE id = _id;
    IF _club IS NULL THEN
      -- association-owned season: the admin's own club acts as owner
      SELECT cm.club_id INTO _club FROM club_members cm WHERE cm.user_id = _uid AND public.is_club_admin(_uid, cm.club_id) LIMIT 1;
    END IF;
    IF _club IS NOT NULL AND (public.is_club_admin(_uid, _club) OR public.has_role(_uid,'admin'::app_role)) THEN RETURN _club; END IF;
  END IF;
  RETURN NULL;
END $$;

-- Validity window (computed on read so date changes never need new links)
CREATE OR REPLACE FUNCTION public.md_window(_kind text, _id uuid, OUT starts_on date, OUT ends_on date)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _kind = 'tournament' THEN
    SELECT LEAST(c.start_date, min(m.scheduled_date), min(m.play_by)), GREATEST(c.end_date, c.playoff_date, max(m.scheduled_date), max(m.play_by))
      INTO starts_on, ends_on
      FROM club_champs c LEFT JOIN club_champs_matches m ON m.champ_id = c.id WHERE c.id = _id GROUP BY c.id;
  ELSE
    SELECT COALESCE(s.starts_on, min(f.fixture_date)), GREATEST(s.ends_on, max(f.fixture_date))
      INTO starts_on, ends_on
      FROM league_seasons s LEFT JOIN platform_league_fixtures f ON f.season_id = s.id WHERE s.id = _id GROUP BY s.id;
  END IF;
  -- grace: 2 days after the last date; open from 7 days before the first
  starts_on := COALESCE(starts_on, CURRENT_DATE) - 7;
  ends_on := COALESCE(ends_on, CURRENT_DATE) + 2;
END $$;

CREATE OR REPLACE FUNCTION public.md_admin_get(_kind text, _id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _club uuid := public.md_can_manage(_kind, _id); r match_day_access; w record;
BEGIN
  IF _club IS NULL THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE='42501'; END IF;
  SELECT * INTO r FROM match_day_access WHERE competition_kind=_kind AND competition_id=_id AND status='active';
  SELECT * INTO w FROM public.md_window(_kind, _id);
  RETURN jsonb_build_object('enabled', r.id IS NOT NULL, 'token', r.token, 'created_at', r.created_at,
    'starts_on', w.starts_on, 'ends_on', w.ends_on);
END $$;

CREATE OR REPLACE FUNCTION public.md_admin_enable(_kind text, _id uuid, _regenerate boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE _club uuid := public.md_can_manage(_kind, _id); _old match_day_access; _tok text;
BEGIN
  IF _club IS NULL THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE='42501'; END IF;
  SELECT * INTO _old FROM match_day_access WHERE competition_kind=_kind AND competition_id=_id AND status='active';
  IF _old.id IS NOT NULL AND NOT _regenerate THEN RETURN public.md_admin_get(_kind,_id); END IF;
  IF _old.id IS NOT NULL THEN
    UPDATE match_day_access SET status='superseded', revoked_at=now() WHERE id=_old.id;
  END IF;
  _tok := translate(encode(gen_random_bytes(24), 'base64'), '+/=', '-_');
  INSERT INTO match_day_access (club_id, competition_kind, competition_id, token, token_hash, created_by, regenerated_from)
  VALUES (_club, _kind, _id, _tok, encode(digest(_tok,'sha256'),'hex'), auth.uid(), _old.id);
  INSERT INTO audit_events (club_id, actor_user_id, entity_type, entity_id, action)
  VALUES (_club, auth.uid(), 'match_day_access', _id, CASE WHEN _old.id IS NULL THEN 'enabled' ELSE 'regenerated' END);
  RETURN public.md_admin_get(_kind,_id);
END $$;

CREATE OR REPLACE FUNCTION public.md_admin_revoke(_kind text, _id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _club uuid := public.md_can_manage(_kind, _id);
BEGIN
  IF _club IS NULL THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE='42501'; END IF;
  UPDATE match_day_access SET status='revoked', revoked_at=now() WHERE competition_kind=_kind AND competition_id=_id AND status='active';
  INSERT INTO audit_events (club_id, actor_user_id, entity_type, entity_id, action) VALUES (_club, auth.uid(), 'match_day_access', _id, 'revoked');
  RETURN public.md_admin_get(_kind,_id);
END $$;

CREATE OR REPLACE FUNCTION public.md_resolve(_token text)
RETURNS match_day_access LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT * FROM match_day_access WHERE token_hash = encode(digest(coalesce(_token,''),'sha256'),'hex') AND status='active' LIMIT 1
$$;

-- Public read model: fixtures, live, results only for this competition
CREATE OR REPLACE FUNCTION public.md_context(_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
    SELECT coalesce(label, season_year::text) INTO _name FROM league_seasons WHERE id = a.competition_id;
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', f.id, 'date', f.fixture_date, 'time', f.start_time, 'court_id', f.court_id, 'division', f.division,
      'status', coalesce(r.status, f.status), 'score', f.score,
      'side_a', coalesce(f.home_team_name_snapshot, f.home_team_code), 'side_b', coalesce(f.away_team_name_snapshot, f.away_team_code),
      'totals', CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object('home_games', r.home_total_games, 'away_games', r.away_total_games, 'home_points', r.home_total_points, 'away_points', r.away_total_points, 'winner', r.winner) END,
      'scorable', coalesce(r.status,'') NOT IN ('submitted','completed'),
      'rubbers', (SELECT coalesce(jsonb_agg(jsonb_build_object('position', x.position, 'home', concat_ws(' & ', x.home_player_name, x.home_player2_name), 'away', concat_ws(' & ', x.away_player_name, x.away_player2_name), 'game_scores', x.game_scores, 'home_won', x.home_games_won, 'away_won', x.away_games_won, 'winner', x.winner) ORDER BY x.position), '[]') FROM league_match_results x WHERE x.fixture_id = f.id)
    ) ORDER BY f.fixture_date, f.start_time NULLS LAST, f.court_id), '[]')
    INTO _matches
    FROM platform_league_fixtures f LEFT JOIN league_fixture_results r ON r.fixture_id = f.id
    WHERE f.season_id = a.competition_id
      AND (f.court_id IS NULL OR f.court_id IN (SELECT id FROM courts WHERE club_id = a.club_id));
  END IF;
  RETURN jsonb_build_object('ok', true, 'kind', a.competition_kind, 'name', _name, 'club_name', _club_name, 'subdomain', _sub,
    'starts_on', w.starts_on, 'ends_on', w.ends_on, 'scoring_open', CURRENT_DATE BETWEEN w.starts_on AND w.ends_on,
    'courts', _courts, 'matches', _matches, 'settings', _extra);
END $$;

CREATE OR REPLACE FUNCTION public.md_save_tournament_result(_token text, _court integer, _match_id uuid, _score text, _game_scores text, _winner_side text, _device text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a match_day_access := public.md_resolve(_token); w record; m club_champs_matches; _winner uuid; _label text;
BEGIN
  IF a.id IS NULL OR a.competition_kind <> 'tournament' THEN RAISE EXCEPTION 'This scoring link is not valid' USING ERRCODE='42501'; END IF;
  SELECT * INTO w FROM public.md_window(a.competition_kind, a.competition_id);
  IF CURRENT_DATE NOT BETWEEN w.starts_on AND w.ends_on THEN RAISE EXCEPTION 'Scoring is closed for this competition' USING ERRCODE='42501'; END IF;
  SELECT * INTO m FROM club_champs_matches WHERE id = _match_id AND champ_id = a.competition_id FOR UPDATE;
  IF m.id IS NULL THEN RAISE EXCEPTION 'Match not part of this competition' USING ERRCODE='42501'; END IF;
  IF _court IS NOT NULL AND m.court_id IS DISTINCT FROM _court THEN RAISE EXCEPTION 'This match is not on this court' USING ERRCODE='42501'; END IF;
  IF m.status IN ('completed','placeholder') OR coalesce(m.is_bye,false) THEN RAISE EXCEPTION 'This match already has a result' USING ERRCODE='42501'; END IF;
  IF _winner_side NOT IN ('a','b') OR coalesce(_score,'') = '' THEN RAISE EXCEPTION 'Invalid result' USING ERRCODE='22023'; END IF;
  _winner := CASE WHEN _winner_side='a' THEN m.player_a_member_id ELSE m.player_b_member_id END;
  UPDATE club_champs_matches SET score=_score, game_scores=_game_scores, winner_member_id=_winner, status='completed' WHERE id=m.id AND status <> 'completed';
  _label := 'Match Day Access (' || CASE WHEN _court IS NULL THEN 'all courts' ELSE 'Court ' || _court END || ')';
  INSERT INTO audit_events (club_id, actor_label, entity_type, entity_id, action, after_data)
  VALUES (a.club_id, _label, 'club_champs_match', m.id, 'match_day_result', jsonb_build_object('score',_score,'winner_side',_winner_side,'access_id',a.id,'device',left(_device,200)));
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.md_save_league_rubber(_token text, _court integer, _fixture_id uuid, _position integer, _game_scores jsonb, _device text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE a match_day_access := public.md_resolve(_token); w record; f platform_league_fixtures; r league_fixture_results; x league_match_results; hw int := 0; aw int := 0; g jsonb; _label text;
BEGIN
  IF a.id IS NULL OR a.competition_kind <> 'league_season' THEN RAISE EXCEPTION 'This scoring link is not valid' USING ERRCODE='42501'; END IF;
  SELECT * INTO w FROM public.md_window(a.competition_kind, a.competition_id);
  IF CURRENT_DATE NOT BETWEEN w.starts_on AND w.ends_on THEN RAISE EXCEPTION 'Scoring is closed for this competition' USING ERRCODE='42501'; END IF;
  SELECT * INTO f FROM platform_league_fixtures WHERE id=_fixture_id AND season_id=a.competition_id;
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
END $$;

REVOKE ALL ON FUNCTION public.md_resolve(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.md_can_manage(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.md_admin_get(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.md_admin_enable(text, uuid, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.md_admin_revoke(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.md_admin_get(text, uuid), public.md_admin_enable(text, uuid, boolean), public.md_admin_revoke(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.md_context(text), public.md_save_tournament_result(text, integer, uuid, text, text, text, text), public.md_save_league_rubber(text, integer, uuid, integer, jsonb, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.md_resolve(text), public.md_window(text, uuid) TO service_role;