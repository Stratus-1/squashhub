ALTER TABLE public.leagues ADD COLUMN IF NOT EXISTS created_by_association_id uuid REFERENCES public.clubs(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.is_association_admin(_user_id uuid, _tenant_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_club_admin(_user_id, _tenant_id) OR public.has_role(_user_id, 'admin'::app_role);
$$;

CREATE OR REPLACE FUNCTION public.association_league_teams(_tenant_id uuid, _season_year int DEFAULT NULL)
RETURNS TABLE (
  team_id uuid, team_name text, team_code text, level int, is_reserve boolean,
  category text, season_year int, club_id uuid, club_name text,
  created_by_association boolean, player_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_association_admin(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'Not an association admin';
  END IF;
  RETURN QUERY
  SELECT l.id, l.name, l.code, l.level, COALESCE(l.is_reserve, false),
         l.category, l.season_year, c.id, c.name,
         l.created_by_association_id IS NOT NULL,
         (SELECT count(*) FROM public.member_league_registrations r WHERE r.league_id = l.id)
  FROM public.leagues l
  JOIN public.clubs c ON c.id = l.club_id
  JOIN public.association_affiliated_clubs a
    ON a.club_id = l.club_id AND a.association_tenant_id = _tenant_id AND a.status = 'active'
  WHERE l.archived_at IS NULL
    AND (_season_year IS NULL OR l.season_year IS NOT DISTINCT FROM _season_year);
END;
$$;

CREATE OR REPLACE FUNCTION public.association_league_team_players(_tenant_id uuid, _team_id uuid)
RETURNS TABLE (
  registration_id uuid, member_id uuid, player_name text,
  league_number text, player_rank int, is_reserve boolean, is_captain boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_association_admin(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'Not an association admin';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.leagues l
    JOIN public.association_affiliated_clubs a
      ON a.club_id = l.club_id AND a.association_tenant_id = _tenant_id AND a.status = 'active'
    WHERE l.id = _team_id
  ) THEN
    RAISE EXCEPTION 'Team is not owned by an affiliated club';
  END IF;
  RETURN QUERY
  SELECT r.id, cm.id, COALESCE(cm.name, 'Player'),
         COALESCE(r.league_association_number, r.ssa_number),
         r.player_rank, r.is_reserve, r.is_captain
  FROM public.member_league_registrations r
  JOIN public.club_members cm ON cm.id = r.club_member_id
  WHERE r.league_id = _team_id
  ORDER BY r.is_reserve, COALESCE(r.player_rank, 999), cm.name;
END;
$$;

CREATE OR REPLACE FUNCTION public.association_create_team(
  _tenant_id uuid, _club_id uuid, _name text, _code text DEFAULT NULL,
  _level int DEFAULT NULL, _category text DEFAULT NULL,
  _is_reserve boolean DEFAULT false, _season_year int DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_assoc uuid;
BEGIN
  IF NOT public.is_association_admin(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'Not an association admin';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.association_affiliated_clubs a
    WHERE a.club_id = _club_id AND a.association_tenant_id = _tenant_id AND a.status = 'active'
  ) THEN
    RAISE EXCEPTION 'Club is not affiliated with this association';
  END IF;
  SELECT la.id INTO v_assoc FROM public.league_associations la
   WHERE la.club_id = _club_id
   ORDER BY (la.name = (SELECT name FROM public.clubs WHERE id = _tenant_id)) DESC
   LIMIT 1;
  INSERT INTO public.leagues (club_id, association_id, name, code, level, category, is_reserve, season_year, created_by_association_id)
  VALUES (_club_id, v_assoc, _name, NULLIF(_code, ''), _level, NULLIF(_category, ''), COALESCE(_is_reserve, false), _season_year, _tenant_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.association_add_placeholder_player(
  _tenant_id uuid, _team_id uuid, _name text,
  _league_number text DEFAULT NULL, _player_rank int DEFAULT NULL, _is_reserve boolean DEFAULT false
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_club uuid; v_member uuid;
BEGIN
  IF NOT public.is_association_admin(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'Not an association admin';
  END IF;
  SELECT l.club_id INTO v_club FROM public.leagues l
  JOIN public.association_affiliated_clubs a
    ON a.club_id = l.club_id AND a.association_tenant_id = _tenant_id AND a.status = 'active'
  WHERE l.id = _team_id;
  IF v_club IS NULL THEN
    RAISE EXCEPTION 'Team is not owned by an affiliated club';
  END IF;

  SELECT cm.id INTO v_member FROM public.club_members cm
   WHERE cm.club_id = v_club
     AND _league_number IS NOT NULL
     AND upper(COALESCE(cm.league_association_number, '')) = upper(_league_number)
   LIMIT 1;

  IF v_member IS NULL THEN
    INSERT INTO public.club_members (club_id, name, role, plays_league, is_league_only_membership, billing_exempt, league_association_number)
    VALUES (v_club, NULLIF(trim(_name), ''), 'member', true, true, true, NULLIF(_league_number, ''))
    RETURNING id INTO v_member;
  END IF;

  INSERT INTO public.member_league_registrations (club_member_id, league_id, league_association_number, player_rank, is_reserve)
  VALUES (v_member, _team_id, NULLIF(_league_number, ''), _player_rank, COALESCE(_is_reserve, false))
  ON CONFLICT (club_member_id, league_id) DO UPDATE
    SET player_rank = EXCLUDED.player_rank, is_reserve = EXCLUDED.is_reserve, updated_at = now();
  RETURN v_member;
END;
$$;

CREATE OR REPLACE FUNCTION public.association_save_fixtures(
  _tenant_id uuid, _platform_association_id uuid, _fixtures jsonb
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int := 0;
BEGIN
  IF NOT public.is_association_admin(auth.uid(), _tenant_id) THEN
    RAISE EXCEPTION 'Not an association admin';
  END IF;
  INSERT INTO public.platform_league_fixtures
    (association_id, fixture_date, venue_name, home_team_code, away_team_code, division,
     home_team_id, away_team_id, home_team_name_snapshot, away_team_name_snapshot, status)
  SELECT _platform_association_id,
         (f->>'fixture_date')::date,
         COALESCE(f->>'venue_name', ''),
         COALESCE(f->>'home_team_code', ''),
         COALESCE(f->>'away_team_code', ''),
         COALESCE(f->>'division', ''),
         NULLIF(f->>'home_team_id', '')::uuid,
         NULLIF(f->>'away_team_id', '')::uuid,
         f->>'home_team_name',
         f->>'away_team_name',
         'scheduled'
  FROM jsonb_array_elements(_fixtures) f;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.association_league_teams(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.association_league_team_players(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.association_create_team(uuid, uuid, text, text, int, text, boolean, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.association_add_placeholder_player(uuid, uuid, text, text, int, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.association_save_fixtures(uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_association_admin(uuid, uuid) TO authenticated;