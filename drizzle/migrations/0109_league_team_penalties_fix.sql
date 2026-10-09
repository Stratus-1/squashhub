CREATE OR REPLACE FUNCTION public.league_penalty_rule_save(
  _association_id uuid, _rule_id uuid, _name text, _description text, _default_points integer, _is_active boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid; _before jsonb;
BEGIN
  IF NOT public.is_association_admin(auth.uid(), _association_id) THEN
    RAISE EXCEPTION 'Only league admins can manage penalty rules';
  END IF;
  IF coalesce(btrim(_name),'') = '' THEN RAISE EXCEPTION 'Give the rule a name'; END IF;
  IF _default_points IS NULL OR _default_points <= 0 THEN
    RAISE EXCEPTION 'Default points must be a positive number of points to deduct';
  END IF;
  IF _rule_id IS NULL THEN
    INSERT INTO league_penalty_rules(association_id, name, description, default_points, is_active, created_by, updated_by)
    VALUES (_association_id, btrim(_name), nullif(btrim(coalesce(_description,'')),''), _default_points, coalesce(_is_active,true), auth.uid(), auth.uid())
    RETURNING id INTO _id;
  ELSE
    SELECT to_jsonb(r) INTO _before FROM league_penalty_rules r WHERE id = _rule_id AND association_id = _association_id;
    UPDATE league_penalty_rules SET name = btrim(_name), description = nullif(btrim(coalesce(_description,'')),''),
      default_points = _default_points, is_active = coalesce(_is_active,true), updated_by = auth.uid(), updated_at = now()
    WHERE id = _rule_id AND association_id = _association_id RETURNING id INTO _id;
    IF _id IS NULL THEN RAISE EXCEPTION 'Rule not found for this league'; END IF;
  END IF;
  INSERT INTO audit_events(actor_user_id, entity_type, entity_id, action, before_data, after_data)
  SELECT auth.uid(), 'league_penalty_rule', _id, CASE WHEN _rule_id IS NULL THEN 'created' ELSE 'updated' END, _before, to_jsonb(r)
  FROM league_penalty_rules r WHERE r.id = _id;
  RETURN _id;
END $$;

CREATE OR REPLACE FUNCTION public.league_apply_team_penalty(
  _association_id uuid, _team_code text, _rule_id uuid, _points integer, _reason text,
  _fixture_id uuid DEFAULT NULL, _season_id uuid DEFAULT NULL, _effective_date date DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r league_penalty_rules; f platform_league_fixtures; _id uuid; _pts integer; _date date; _season uuid; _year integer;
BEGIN
  IF NOT public.is_association_admin(auth.uid(), _association_id) THEN
    RAISE EXCEPTION 'Only league admins can apply penalties';
  END IF;
  SELECT * INTO r FROM league_penalty_rules WHERE id = _rule_id AND association_id = _association_id;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Penalty rule not found for this league'; END IF;
  IF NOT r.is_active THEN RAISE EXCEPTION 'This penalty rule is not active'; END IF;
  _pts := coalesce(_points, r.default_points);
  IF _pts <= 0 THEN RAISE EXCEPTION 'Enter the points to deduct as a positive number'; END IF;
  IF coalesce(btrim(_team_code),'') = '' THEN RAISE EXCEPTION 'Choose the affected team'; END IF;
  _season := _season_id;
  _date := coalesce(_effective_date, current_date);
  IF _fixture_id IS NOT NULL THEN
    SELECT * INTO f FROM platform_league_fixtures WHERE id = _fixture_id;
    IF f.id IS NULL THEN RAISE EXCEPTION 'Fixture not found'; END IF;
    IF upper(_team_code) NOT IN (upper(coalesce(f.home_team_code,'')), upper(coalesce(f.away_team_code,''))) THEN
      RAISE EXCEPTION 'That team did not play in this fixture';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM league_fixture_results WHERE fixture_id = _fixture_id AND status IN ('submitted','confirmed')) THEN
      RAISE EXCEPTION 'Penalties can only be applied to a completed fixture';
    END IF;
    _date := f.fixture_date;
    _season := coalesce(f.season_id, _season);
  END IF;
  IF _season IS NOT NULL THEN SELECT season_year INTO _year FROM league_seasons WHERE id = _season; END IF;
  _year := coalesce(_year, extract(year FROM _date)::int);
  BEGIN
    INSERT INTO league_team_penalties(association_id, season_id, season_year, effective_date, team_code, fixture_id,
      rule_id, rule_name, points, reason, applied_by)
    VALUES (_association_id, _season, _year, _date, upper(btrim(_team_code)), _fixture_id, r.id, r.name, _pts,
      nullif(btrim(coalesce(_reason,'')),''), auth.uid())
    RETURNING id INTO _id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'This penalty has already been applied to this team for this fixture';
  END;
  RETURN _id;
END $$;