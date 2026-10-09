CREATE TABLE public.league_penalty_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  association_id uuid NOT NULL REFERENCES public.league_associations(id),
  name text NOT NULL CHECK (length(btrim(name)) > 0),
  description text,
  default_points integer NOT NULL CHECK (default_points > 0 AND default_points <= 1000),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX league_penalty_rules_assoc_idx ON public.league_penalty_rules(association_id);
GRANT SELECT ON public.league_penalty_rules TO authenticated;
GRANT ALL ON public.league_penalty_rules TO service_role;
ALTER TABLE public.league_penalty_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read penalty rules" ON public.league_penalty_rules FOR SELECT TO authenticated USING (true);

-- Team penalties: deduction is ALWAYS stored as a positive number of points and
-- subtracted from season standings only. Never deleted; reversal is a stamp.
CREATE TABLE public.league_team_penalties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  association_id uuid NOT NULL REFERENCES public.league_associations(id),
  season_id uuid REFERENCES public.league_seasons(id),
  season_year integer NOT NULL,
  effective_date date NOT NULL,
  team_code text NOT NULL,
  fixture_id uuid REFERENCES public.platform_league_fixtures(id),
  rule_id uuid REFERENCES public.league_penalty_rules(id),
  rule_name text NOT NULL,
  points integer NOT NULL CHECK (points > 0 AND points <= 1000),
  reason text,
  applied_by uuid NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  reversed_at timestamptz,
  reversed_by uuid,
  reversal_reason text
);
CREATE INDEX league_team_penalties_assoc_idx ON public.league_team_penalties(association_id, season_year);
CREATE UNIQUE INDEX league_team_penalties_no_double
  ON public.league_team_penalties(association_id, team_code, fixture_id, rule_id)
  WHERE reversed_at IS NULL AND fixture_id IS NOT NULL;
GRANT SELECT ON public.league_team_penalties TO authenticated;
GRANT ALL ON public.league_team_penalties TO service_role;
ALTER TABLE public.league_team_penalties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed-in users read team penalties" ON public.league_team_penalties FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.league_penalty_rule_save(
  _association_id uuid, _rule_id uuid, _name text, _description text, _default_points integer, _is_active boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  IF NOT public.is_association_admin(auth.uid(), _association_id) THEN
    RAISE EXCEPTION 'Only league admins can manage penalty rules';
  END IF;
  IF _default_points IS NULL OR _default_points <= 0 THEN
    RAISE EXCEPTION 'Default points must be a positive number of points to deduct';
  END IF;
  IF _rule_id IS NULL THEN
    INSERT INTO league_penalty_rules(association_id, name, description, default_points, is_active, created_by, updated_by)
    VALUES (_association_id, btrim(_name), nullif(btrim(coalesce(_description,'')),''), _default_points, coalesce(_is_active,true), auth.uid(), auth.uid())
    RETURNING id INTO _id;
  ELSE
    UPDATE league_penalty_rules SET name = btrim(_name), description = nullif(btrim(coalesce(_description,'')),''),
      default_points = _default_points, is_active = coalesce(_is_active,true), updated_by = auth.uid(), updated_at = now()
    WHERE id = _rule_id AND association_id = _association_id RETURNING id INTO _id;
    IF _id IS NULL THEN RAISE EXCEPTION 'Rule not found for this league'; END IF;
  END IF;
  INSERT INTO audit_events(action, entity_type, entity_id, actor_user_id, details)
  SELECT 'league_penalty_rule_saved', 'league_penalty_rule', _id::text, auth.uid(),
    jsonb_build_object('association_id', _association_id, 'name', _name, 'default_points', _default_points, 'active', _is_active)
  WHERE EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='audit_events' AND column_name='details');
  RETURN _id;
EXCEPTION WHEN undefined_column OR undefined_table THEN RETURN _id;
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
    IF NOT EXISTS (SELECT 1 FROM league_fixture_results WHERE fixture_id = _fixture_id::text AND status IN ('submitted','confirmed')) THEN
      RAISE EXCEPTION 'Penalties can only be applied to a completed fixture';
    END IF;
    _date := f.fixture_date;
    _season := coalesce(f.season_id, _season);
  END IF;
  IF _season IS NOT NULL THEN SELECT season_year INTO _year FROM league_seasons WHERE id = _season; END IF;
  _year := coalesce(_year, extract(year FROM _date)::int);
  INSERT INTO league_team_penalties(association_id, season_id, season_year, effective_date, team_code, fixture_id,
    rule_id, rule_name, points, reason, applied_by)
  VALUES (_association_id, _season, _year, _date, upper(btrim(_team_code)), _fixture_id, r.id, r.name, _pts,
    nullif(btrim(coalesce(_reason,'')),''), auth.uid())
  RETURNING id INTO _id;
  RETURN _id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'This penalty has already been applied to this team for this fixture';
END $$;

CREATE OR REPLACE FUNCTION public.league_reverse_team_penalty(_penalty_id uuid, _reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p league_team_penalties;
BEGIN
  SELECT * INTO p FROM league_team_penalties WHERE id = _penalty_id;
  IF p.id IS NULL THEN RAISE EXCEPTION 'Penalty not found'; END IF;
  IF NOT public.is_association_admin(auth.uid(), p.association_id) THEN
    RAISE EXCEPTION 'Only league admins can reverse penalties';
  END IF;
  IF p.reversed_at IS NOT NULL THEN RAISE EXCEPTION 'This penalty was already reversed'; END IF;
  IF coalesce(btrim(_reason),'') = '' THEN RAISE EXCEPTION 'Give a reason for the reversal'; END IF;
  UPDATE league_team_penalties SET reversed_at = now(), reversed_by = auth.uid(), reversal_reason = btrim(_reason)
  WHERE id = _penalty_id AND reversed_at IS NULL;
END $$;

REVOKE ALL ON FUNCTION public.league_penalty_rule_save(uuid,uuid,text,text,integer,boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.league_apply_team_penalty(uuid,text,uuid,integer,text,uuid,uuid,date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.league_reverse_team_penalty(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.league_penalty_rule_save(uuid,uuid,text,text,integer,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.league_apply_team_penalty(uuid,text,uuid,integer,text,uuid,uuid,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.league_reverse_team_penalty(uuid,text) TO authenticated;