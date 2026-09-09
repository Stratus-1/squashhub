CREATE OR REPLACE FUNCTION public.get_member_match_history(_member_id uuid, _season_year integer DEFAULT NULL::integer, _category text DEFAULT NULL::text, _opponent_member_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(source text, match_id uuid, category text, season_year integer, played_on date, opponent_member_id uuid, opponent_name text, event_label text, score text, won boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.can_view_member_stats(_member_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH league (s_source, s_match_id, s_category, s_season_year, s_played_on, s_opponent_member_id, s_event_label, s_score, s_won, s_opponent_fallback) AS (
    SELECT
      'league'::text,
      r.id,
      'league'::text,
      EXTRACT(YEAR FROM f.fixture_date)::int,
      f.fixture_date,
      CASE WHEN r.home_player_member_id = _member_id THEN r.away_player_member_id
           ELSE r.home_player_member_id END,
      COALESCE(NULLIF(f.division, ''), 'League'),
      COALESCE(r.home_games_won::text || '-' || r.away_games_won::text, ''),
      CASE
        WHEN r.home_player_member_id = _member_id OR r.home_player2_member_id = _member_id THEN r.winner = 'home'
        ELSE r.winner = 'away'
      END,
      NULL::text
    FROM public.league_match_results r
    JOIN public.platform_league_fixtures f ON f.id = r.fixture_id
    WHERE r.winner IS NOT NULL
      AND f.fixture_date IS NOT NULL
      AND (
        r.home_player_member_id = _member_id OR r.away_player_member_id = _member_id
        OR r.home_player2_member_id = _member_id OR r.away_player2_member_id = _member_id
      )
  ),
  nsa (s_source, s_match_id, s_category, s_season_year, s_played_on, s_opponent_member_id, s_event_label, s_score, s_won, s_opponent_fallback) AS (
    SELECT
      'nsa'::text,
      h.id,
      'league'::text,
      COALESCE(h.season_year, EXTRACT(YEAR FROM h.fixture_date)::int),
      h.fixture_date,
      NULL::uuid,
      COALESCE(NULLIF(h.league_label, ''), 'League'),
      COALESCE(h.games_for::text || '-' || h.games_against::text, ''),
      COALESCE(h.won, false),
      h.opponent_name
    FROM public.nsa_rubber_history h
    WHERE h.player_code IN (
      SELECT a.league_association_number
      FROM public.member_association_affiliations a
      WHERE a.club_member_id = _member_id
        AND a.league_association_number IS NOT NULL
    )
  ),
  league_dates AS (
    SELECT l.s_played_on AS d FROM league l WHERE l.s_played_on IS NOT NULL
    UNION
    SELECT n.s_played_on FROM nsa n WHERE n.s_played_on IS NOT NULL
  ),
  club_matches (s_source, s_match_id, s_category, s_season_year, s_played_on, s_opponent_member_id, s_event_label, s_score, s_won, s_opponent_fallback) AS (
    SELECT
      'match'::text,
      m.id,
      public.normalise_competition_level(m.source_type),
      COALESCE(m.season_year, EXTRACT(YEAR FROM m.match_date)::int),
      m.match_date,
      CASE WHEN m.player_a_member_id = _member_id THEN m.player_b_member_id
           ELSE m.player_a_member_id END,
      COALESCE(NULLIF(m.event_label, ''), NULLIF(m.notes, ''), 'Club match'),
      m.score,
      (m.winner_member_id = _member_id),
      NULLIF(m.external_opponent_name, '')
    FROM public.matches m
    WHERE (m.player_a_member_id = _member_id OR m.player_b_member_id = _member_id)
      AND m.match_date IS NOT NULL
      AND COALESCE(m.disputed, false) = false
      AND NOT (
        COALESCE(m.is_imported, false)
        AND EXISTS (SELECT 1 FROM league_dates ld WHERE ld.d = m.match_date)
      )
  ),
  champ (s_source, s_match_id, s_category, s_season_year, s_played_on, s_opponent_member_id, s_event_label, s_score, s_won, s_opponent_fallback) AS (
    SELECT
      'champ'::text,
      cm.id,
      public.normalise_competition_level(
        COALESCE(
          t.competition_level,
          CASE
            WHEN t.event_type ILIKE '%national%' THEN 'national'
            WHEN t.event_type ILIKE '%provincial%' OR t.event_type ILIKE '%regional%' THEN 'regional'
            ELSE 'club'
          END
        )
      ),
      EXTRACT(YEAR FROM COALESCE(cm.scheduled_date, cm.created_at::date))::int,
      COALESCE(cm.scheduled_date, cm.created_at::date),
      CASE
        WHEN cm.player_a_member_id = _member_id OR cm.partner_a_member_id = _member_id
          THEN cm.player_b_member_id
        ELSE cm.player_a_member_id
      END,
      COALESCE(t.name, 'Club championship'),
      cm.score,
      (
        (
          (cm.player_a_member_id = _member_id OR cm.partner_a_member_id = _member_id)
          AND (cm.winner_member_id = cm.player_a_member_id OR cm.winner_member_id = cm.partner_a_member_id)
        )
        OR
        (
          (cm.player_b_member_id = _member_id OR cm.partner_b_member_id = _member_id)
          AND (cm.winner_member_id = cm.player_b_member_id OR cm.winner_member_id = cm.partner_b_member_id)
        )
      ),
      NULL::text
    FROM public.club_champs_matches cm
    LEFT JOIN public.tournaments t ON t.id = cm.champ_id
    WHERE cm.status = 'completed'
      AND COALESCE(cm.is_bye, false) = false
      AND cm.winner_member_id IS NOT NULL
      AND (
        cm.player_a_member_id = _member_id OR cm.player_b_member_id = _member_id
        OR cm.partner_a_member_id = _member_id OR cm.partner_b_member_id = _member_id
      )
  ),
  unioned AS (
    SELECT * FROM club_matches
    UNION ALL SELECT * FROM champ
    UNION ALL SELECT * FROM league
    UNION ALL SELECT * FROM nsa
  )
  SELECT
    u.s_source,
    u.s_match_id,
    u.s_category,
    u.s_season_year,
    u.s_played_on,
    u.s_opponent_member_id,
    COALESCE(om.name, u.s_opponent_fallback, 'Unknown'),
    u.s_event_label,
    u.s_score,
    u.s_won
  FROM unioned u
  LEFT JOIN public.club_members om ON om.id = u.s_opponent_member_id
  WHERE (_season_year IS NULL OR u.s_season_year = _season_year)
    AND (_category IS NULL OR _category = 'total' OR u.s_category = _category)
    AND (_opponent_member_id IS NULL OR u.s_opponent_member_id = _opponent_member_id)
  ORDER BY u.s_played_on DESC NULLS LAST;
END;
$function$;