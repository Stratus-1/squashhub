CREATE OR REPLACE FUNCTION public.md_header_access()
RETURNS public.match_day_access
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $$
DECLARE _h text; a match_day_access;
BEGIN
  BEGIN
    _h := nullif(current_setting('request.headers', true), '')::json->>'x-match-day-token';
  EXCEPTION WHEN others THEN _h := NULL; END;
  IF _h IS NULL OR length(_h) < 16 THEN RETURN NULL; END IF;
  SELECT * INTO a FROM public.md_resolve(_h);
  RETURN a;
END $$;

CREATE OR REPLACE FUNCTION public.md_hdr_court()
RETURNS int LANGUAGE plpgsql STABLE SET search_path TO 'public'
AS $$
BEGIN
  RETURN nullif(nullif(current_setting('request.headers', true), '')::json->>'x-match-day-court', '')::int;
EXCEPTION WHEN others THEN RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.md_hdr_fixture_ids()
RETURNS uuid[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE a match_day_access := public.md_header_access(); _ids uuid[];
BEGIN
  IF a.id IS NULL OR a.competition_kind <> 'league_season' THEN RETURN '{}'::uuid[]; END IF;
  SELECT coalesce(array_agg(f.id), '{}') INTO _ids FROM public.md_season_fixtures(a.competition_id) f
   WHERE f.court_id IS NULL OR f.court_id IN (SELECT id FROM courts WHERE club_id = a.club_id);
  RETURN _ids;
END $$;

CREATE OR REPLACE FUNCTION public.md_hdr_writable_fixture_ids()
RETURNS uuid[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE a match_day_access := public.md_header_access(); w record; _ids uuid[];
BEGIN
  IF a.id IS NULL OR a.competition_kind <> 'league_season' THEN RETURN '{}'::uuid[]; END IF;
  SELECT * INTO w FROM public.md_window(a.competition_kind, a.competition_id);
  IF CURRENT_DATE NOT BETWEEN w.starts_on AND w.ends_on THEN RETURN '{}'::uuid[]; END IF;
  SELECT coalesce(array_agg(x), '{}') INTO _ids FROM unnest(public.md_hdr_fixture_ids()) x
   WHERE NOT EXISTS (SELECT 1 FROM league_fixture_results r WHERE r.fixture_id = x
                       AND (r.status IN ('submitted','confirmed','completed') OR coalesce(r.totals_locked,false)));
  RETURN _ids;
END $$;

CREATE OR REPLACE FUNCTION public.md_hdr_club()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT (public.md_header_access()).club_id $$;

CREATE OR REPLACE FUNCTION public.md_hdr_assoc_ids()
RETURNS uuid[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE a match_day_access := public.md_header_access(); _ids uuid[];
BEGIN
  IF a.id IS NULL OR a.competition_kind <> 'league_season' THEN RETURN '{}'::uuid[]; END IF;
  SELECT array_remove(ARRAY[s.association_id, s.platform_association_id, la.platform_association_id], NULL)
    INTO _ids FROM league_seasons s LEFT JOIN league_associations la ON la.id = s.association_id WHERE s.id = a.competition_id;
  RETURN coalesce(_ids, '{}');
END $$;

CREATE OR REPLACE FUNCTION public.md_hdr_league_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT coalesce(array_agg(id), '{}') FROM leagues WHERE association_id = ANY(public.md_hdr_assoc_ids()) $$;

CREATE OR REPLACE FUNCTION public.md_device_info(_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE a match_day_access := public.md_resolve(_token); w record; r jsonb;
BEGIN
  IF a.id IS NULL THEN RETURN jsonb_build_object('ok', false); END IF;
  SELECT * INTO w FROM public.md_window(a.competition_kind, a.competition_id);
  IF a.competition_kind = 'league_season' THEN
    SELECT jsonb_build_object('association_id', s.association_id,
      'platform_association_id', coalesce(s.platform_association_id, la.platform_association_id),
      'name', coalesce(la.name || ' ', '') || coalesce(s.label, s.season_year::text))
      INTO r FROM league_seasons s LEFT JOIN league_associations la ON la.id = s.association_id WHERE s.id = a.competition_id;
  ELSE
    SELECT jsonb_build_object('name', name) INTO r FROM club_champs WHERE id = a.competition_id;
  END IF;
  RETURN coalesce(r, '{}'::jsonb) || jsonb_build_object('ok', true, 'kind', a.competition_kind, 'competition_id', a.competition_id,
    'club_id', a.club_id, 'club_name', (SELECT name FROM clubs WHERE id = a.club_id),
    'courts', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name) ORDER BY id), '[]') FROM courts WHERE club_id = a.club_id),
    'starts_on', w.starts_on, 'ends_on', w.ends_on, 'scoring_open', CURRENT_DATE BETWEEN w.starts_on AND w.ends_on);
END $$;
GRANT EXECUTE ON FUNCTION public.md_device_info(text) TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.league_marker_locks TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.league_match_results TO anon;
GRANT SELECT, INSERT, UPDATE ON public.league_fixture_results TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.league_fixture_lineups TO anon;
GRANT SELECT (id, name, subdomain, league_week_start_dow, fill_up_leagues_enabled) ON public.clubs TO anon;
REVOKE SELECT ON public.club_members FROM anon;
GRANT SELECT (id, club_id, name, club_member_number, ladder_position, gender) ON public.club_members TO anon;

CREATE POLICY "md device read fixtures" ON public.platform_league_fixtures FOR SELECT TO anon
  USING (id = ANY((SELECT public.md_hdr_fixture_ids())::uuid[]));
CREATE POLICY "md device read results" ON public.league_fixture_results FOR SELECT TO anon
  USING (fixture_id = ANY((SELECT public.md_hdr_fixture_ids())::uuid[]));
CREATE POLICY "md device read rubbers" ON public.league_match_results FOR SELECT TO anon
  USING (fixture_id = ANY((SELECT public.md_hdr_fixture_ids())::uuid[]));
CREATE POLICY "md device read lineups" ON public.league_fixture_lineups FOR SELECT TO anon
  USING (fixture_id = ANY((SELECT public.md_hdr_fixture_ids())::uuid[]));
CREATE POLICY "md device read locks" ON public.league_marker_locks FOR SELECT TO anon
  USING (fixture_id = ANY((SELECT public.md_hdr_fixture_ids())::uuid[]));
CREATE POLICY "md device read courts" ON public.courts FOR SELECT TO anon
  USING (club_id = (SELECT public.md_hdr_club()));
CREATE POLICY "md device read club" ON public.clubs FOR SELECT TO anon
  USING (id = (SELECT public.md_hdr_club()));
CREATE POLICY "md device read associations" ON public.league_associations FOR SELECT TO anon
  USING (id = ANY((SELECT public.md_hdr_assoc_ids())::uuid[]));
CREATE POLICY "md device read seasons" ON public.league_seasons FOR SELECT TO anon
  USING (id = (SELECT (public.md_header_access()).competition_id));
CREATE POLICY "md device read leagues" ON public.leagues FOR SELECT TO anon
  USING (id = ANY((SELECT public.md_hdr_league_ids())::uuid[]));
CREATE POLICY "md device read rules" ON public.league_rules FOR SELECT TO anon
  USING (association_id = ANY((SELECT public.md_hdr_assoc_ids())::uuid[]));
CREATE POLICY "md device read rounds" ON public.league_rounds FOR SELECT TO anon
  USING (association_id = ANY((SELECT public.md_hdr_assoc_ids())::uuid[]));
CREATE POLICY "md device read pairs" ON public.league_team_pairs FOR SELECT TO anon
  USING (league_id = ANY((SELECT public.md_hdr_league_ids())::uuid[]));
CREATE POLICY "md device read reserves" ON public.league_reserve_players FOR SELECT TO anon
  USING (association_id = ANY((SELECT public.md_hdr_assoc_ids())::uuid[]));
CREATE POLICY "md device read week lineups" ON public.league_week_lineups FOR SELECT TO anon
  USING (league_id = ANY((SELECT public.md_hdr_league_ids())::uuid[]));
CREATE POLICY "md device read registrations" ON public.member_league_registrations FOR SELECT TO anon
  USING (league_id = ANY((SELECT public.md_hdr_league_ids())::uuid[]));
CREATE POLICY "md device read members" ON public.club_members FOR SELECT TO anon
  USING (id IN (SELECT club_member_id FROM member_league_registrations WHERE league_id = ANY((SELECT public.md_hdr_league_ids())::uuid[])));

CREATE POLICY "md device write locks" ON public.league_marker_locks FOR ALL TO anon
  USING (fixture_id = ANY((SELECT public.md_hdr_writable_fixture_ids())::uuid[]))
  WITH CHECK (fixture_id = ANY((SELECT public.md_hdr_writable_fixture_ids())::uuid[]));
CREATE POLICY "md device write rubbers" ON public.league_match_results FOR ALL TO anon
  USING (fixture_id = ANY((SELECT public.md_hdr_writable_fixture_ids())::uuid[]))
  WITH CHECK (fixture_id = ANY((SELECT public.md_hdr_writable_fixture_ids())::uuid[]));
CREATE POLICY "md device insert results" ON public.league_fixture_results FOR INSERT TO anon
  WITH CHECK (fixture_id = ANY((SELECT public.md_hdr_writable_fixture_ids())::uuid[]) AND coalesce(status,'draft') = 'draft');
CREATE POLICY "md device update results" ON public.league_fixture_results FOR UPDATE TO anon
  USING (fixture_id = ANY((SELECT public.md_hdr_writable_fixture_ids())::uuid[]))
  WITH CHECK (fixture_id = ANY((SELECT public.md_hdr_fixture_ids())::uuid[]));
CREATE POLICY "md device write lineups" ON public.league_fixture_lineups FOR ALL TO anon
  USING (fixture_id = ANY((SELECT public.md_hdr_writable_fixture_ids())::uuid[]))
  WITH CHECK (fixture_id = ANY((SELECT public.md_hdr_writable_fixture_ids())::uuid[]));

CREATE OR REPLACE FUNCTION public.md_audit_device_write()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE a match_day_access; _court int;
BEGIN
  IF coalesce(auth.role(), 'anon') <> 'anon' THEN RETURN NULL; END IF;
  a := public.md_header_access();
  IF a.id IS NULL THEN RETURN NULL; END IF;
  _court := public.md_hdr_court();
  INSERT INTO audit_events (club_id, actor_label, entity_type, entity_id, action, before_data, after_data)
  VALUES (a.club_id,
    'Match Day Access (' || CASE WHEN _court IS NULL THEN 'all courts' ELSE coalesce((SELECT name FROM courts WHERE id = _court), 'Court ' || _court) END || ')',
    TG_TABLE_NAME, (CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END), 'match_day_' || lower(TG_OP),
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END || jsonb_build_object('access_id', a.id));
  RETURN NULL;
END $$;

CREATE TRIGGER md_audit_league_match_results AFTER INSERT OR UPDATE OR DELETE ON public.league_match_results
  FOR EACH ROW EXECUTE FUNCTION public.md_audit_device_write();
CREATE TRIGGER md_audit_league_fixture_results AFTER INSERT OR UPDATE ON public.league_fixture_results
  FOR EACH ROW EXECUTE FUNCTION public.md_audit_device_write();
CREATE TRIGGER md_audit_league_fixture_lineups AFTER INSERT OR UPDATE OR DELETE ON public.league_fixture_lineups
  FOR EACH ROW EXECUTE FUNCTION public.md_audit_device_write();