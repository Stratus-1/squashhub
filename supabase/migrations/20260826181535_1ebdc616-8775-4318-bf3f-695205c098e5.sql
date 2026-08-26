ALTER TABLE public.league_fixture_results
  ADD COLUMN IF NOT EXISTS totals_locked boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.recalc_league_fixture_totals(_fixture_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _fx           public.platform_league_fixtures%ROWTYPE;
  _res          public.league_fixture_results%ROWTYPE;
  _rules        RECORD;
  _assoc        uuid;
  _hg int := 0; _ag int := 0;
  _hw int := 0; _aw int := 0;
  _hpts int := 0; _apts int := 0;
  _hpen numeric := 0; _apen numeric := 0;
  _winner text;
  _mode text; _bval numeric; _share boolean;
  _hmb numeric := 0; _amb numeric := 0;
  _opb_on boolean; _opb_val numeric;
  _hsq text[]; _asq text[]; _hsqn text[]; _asqn text[];
  _horig int := 0; _aorig int := 0;
  _hadj int := 0; _aadj int := 0;
  _any_scored boolean := false;
  r RECORD;
BEGIN
  SELECT * INTO _fx FROM public.platform_league_fixtures WHERE id = _fixture_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO _res FROM public.league_fixture_results WHERE fixture_id = _fixture_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF COALESCE(_res.totals_locked, false) THEN RETURN; END IF;

  -- Aggregate rubbers
  FOR r IN
    SELECT home_games_won, away_games_won, game_scores, is_forfeit, forfeit_side,
           home_player_code, away_player_code, home_player_name, away_player_name
      FROM public.league_match_results
     WHERE fixture_id = _fixture_id
  LOOP
    _hg := _hg + COALESCE(r.home_games_won, 0);
    _ag := _ag + COALESCE(r.away_games_won, 0);
    IF COALESCE(r.home_games_won,0) > COALESCE(r.away_games_won,0) THEN _hw := _hw + 1;
    ELSIF COALESCE(r.away_games_won,0) > COALESCE(r.home_games_won,0) THEN _aw := _aw + 1;
    END IF;
    IF jsonb_typeof(COALESCE(r.game_scores, '[]'::jsonb)) = 'array'
       AND jsonb_array_length(COALESCE(r.game_scores, '[]'::jsonb)) > 0 THEN
      _any_scored := true;
      SELECT _hpts + COALESCE(SUM((g->>'home')::int), 0),
             _apts + COALESCE(SUM((g->>'away')::int), 0)
        INTO _hpts, _apts
        FROM jsonb_array_elements(r.game_scores) g;
    END IF;
    IF COALESCE(r.is_forfeit, false) THEN
      _any_scored := true;
      IF r.forfeit_side = 'home' THEN _hpen := _hpen + 2;
      ELSIF r.forfeit_side = 'away' THEN _apen := _apen + 2;
      END IF;
    END IF;
  END LOOP;

  -- Nothing marked yet: leave whatever is stored alone.
  IF NOT _any_scored THEN RETURN; END IF;

  IF _hw > _aw THEN _winner := 'home';
  ELSIF _aw > _hw THEN _winner := 'away';
  ELSIF _hg > _ag THEN _winner := 'home';
  ELSIF _ag > _hg THEN _winner := 'away';
  ELSIF _hpts > _apts THEN _winner := 'home';
  ELSIF _apts > _hpts THEN _winner := 'away';
  ELSE _winner := 'draw';
  END IF;

  -- League rules: prefer the tenant association that owns the round,
  -- else the tenant association mirroring this platform association.
  SELECT lr.association_id INTO _assoc FROM public.league_rounds lr WHERE lr.id = _fx.round_id;
  IF _assoc IS NULL THEN
    SELECT la.id INTO _assoc FROM public.league_associations la
     WHERE la.platform_association_id = _fx.association_id LIMIT 1;
  END IF;

  SELECT bonus_points_mode, bonus_points_value, share_bonus_on_tie,
         original_player_bonus_enabled, original_player_bonus_value
    INTO _rules
    FROM public.league_rules WHERE association_id = _assoc LIMIT 1;

  _mode    := COALESCE(_rules.bonus_points_mode, 'per_match');
  _bval    := COALESCE(_rules.bonus_points_value, 1);
  _share   := COALESCE(_rules.share_bonus_on_tie, false);
  _opb_on  := COALESCE(_rules.original_player_bonus_enabled, false);
  _opb_val := COALESCE(_rules.original_player_bonus_value, 0);

  IF _mode = 'fixed_winner' THEN
    IF _winner = 'home' THEN _hmb := _bval;
    ELSIF _winner = 'away' THEN _amb := _bval;
    ELSIF _share THEN _hmb := _bval / 2; _amb := _bval / 2;
    END IF;
  ELSIF _mode = 'per_game_won' THEN
    _hmb := _hw * _bval; _amb := _aw * _bval;
  ELSE -- per_match
    IF _winner = 'home' THEN _hmb := _hw * _bval;
    ELSIF _winner = 'away' THEN _amb := _aw * _bval;
    ELSIF _share THEN _hmb := (_hw * _bval) / 2; _amb := (_aw * _bval) / 2;
    END IF;
  END IF;

  IF _opb_on THEN
    SELECT ARRAY(SELECT upper(trim(x)) FROM jsonb_array_elements_text(
             COALESCE(_res.match_format->'permanentSquadSnapshot'->'home'->'codes','[]'::jsonb)) x),
           ARRAY(SELECT upper(trim(x)) FROM jsonb_array_elements_text(
             COALESCE(_res.match_format->'permanentSquadSnapshot'->'away'->'codes','[]'::jsonb)) x),
           ARRAY(SELECT lower(trim(x)) FROM jsonb_array_elements_text(
             COALESCE(_res.match_format->'permanentSquadSnapshot'->'home'->'names','[]'::jsonb)) x),
           ARRAY(SELECT lower(trim(x)) FROM jsonb_array_elements_text(
             COALESCE(_res.match_format->'permanentSquadSnapshot'->'away'->'names','[]'::jsonb)) x)
      INTO _hsq, _asq, _hsqn, _asqn;

    SELECT
      COUNT(*) FILTER (WHERE upper(trim(COALESCE(m.home_player_code,''))) = ANY(_hsq)
                          OR lower(trim(COALESCE(m.home_player_name,''))) = ANY(_hsqn)),
      COUNT(*) FILTER (WHERE upper(trim(COALESCE(m.away_player_code,''))) = ANY(_asq)
                          OR lower(trim(COALESCE(m.away_player_name,''))) = ANY(_asqn))
      INTO _horig, _aorig
      FROM public.league_match_results m
     WHERE m.fixture_id = _fixture_id;

    _hadj := COALESCE((_res.match_format->'originalCountAdjustment'->>'home')::int, 0);
    _aadj := COALESCE((_res.match_format->'originalCountAdjustment'->>'away')::int, 0);
    _horig := GREATEST(0, _horig + _hadj);
    _aorig := GREATEST(0, _aorig + _aadj);
  END IF;

  UPDATE public.league_fixture_results
     SET home_total_games  = _hg,
         away_total_games  = _ag,
         home_bonus_points = ROUND(_hmb + (CASE WHEN _opb_on THEN _horig * _opb_val ELSE 0 END))::int,
         away_bonus_points = ROUND(_amb + (CASE WHEN _opb_on THEN _aorig * _opb_val ELSE 0 END))::int,
         home_penalty_points = _hpen,
         away_penalty_points = _apen,
         home_total_points = ROUND(_hg + _hmb + (CASE WHEN _opb_on THEN _horig * _opb_val ELSE 0 END) - _hpen)::int,
         away_total_points = ROUND(_ag + _amb + (CASE WHEN _opb_on THEN _aorig * _opb_val ELSE 0 END) - _apen)::int,
         winner = _winner,
         updated_at = now()
   WHERE fixture_id = _fixture_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_recalc_league_fixture_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.recalc_league_fixture_totals(COALESCE(NEW.fixture_id, OLD.fixture_id));
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS league_match_results_recalc_totals ON public.league_match_results;
CREATE TRIGGER league_match_results_recalc_totals
AFTER INSERT OR UPDATE OR DELETE ON public.league_match_results
FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_league_fixture_totals();

-- One-off resync of every fixture whose stored totals disagree with the rubbers
DO $$
DECLARE f uuid;
BEGIN
  FOR f IN
    SELECT DISTINCT m.fixture_id
      FROM public.league_match_results m
      JOIN public.league_fixture_results r ON r.fixture_id = m.fixture_id
     WHERE NOT COALESCE(r.totals_locked, false)
     GROUP BY m.fixture_id, r.home_total_games, r.away_total_games
    HAVING SUM(COALESCE(m.home_games_won,0)) <> r.home_total_games
        OR SUM(COALESCE(m.away_games_won,0)) <> r.away_total_games
  LOOP
    PERFORM public.recalc_league_fixture_totals(f);
  END LOOP;
END $$;