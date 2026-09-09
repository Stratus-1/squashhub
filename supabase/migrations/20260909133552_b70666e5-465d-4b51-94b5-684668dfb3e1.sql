
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS source_type TEXT,
  ADD COLUMN IF NOT EXISTS season_year INTEGER;

ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS history_import_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS history_imported_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_external_ids_lookup
  ON public.external_ids (source_system, entity_type, external_id);

CREATE OR REPLACE FUNCTION public.can_view_member_stats(_member_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.club_members target
    JOIN public.club_members me ON me.club_id = target.club_id
    WHERE target.id = _member_id
      AND me.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.get_member_match_history(
  _member_id uuid,
  _season_year integer DEFAULT NULL,
  _category text DEFAULT NULL,
  _opponent_member_id uuid DEFAULT NULL
)
RETURNS TABLE (
  source text,
  match_id uuid,
  category text,
  season_year integer,
  played_on date,
  opponent_member_id uuid,
  opponent_name text,
  event_label text,
  score text,
  won boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.can_view_member_stats(_member_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH club_matches AS (
    SELECT
      'match'::text AS source,
      m.id AS match_id,
      COALESCE(m.source_type, 'club') AS raw_source,
      'club'::text AS category,
      COALESCE(m.season_year, EXTRACT(YEAR FROM m.match_date)::int) AS season_year,
      m.match_date AS played_on,
      CASE WHEN m.player_a_member_id = _member_id THEN m.player_b_member_id
           ELSE m.player_a_member_id END AS opponent_member_id,
      COALESCE(m.notes, 'Club match') AS event_label,
      m.score AS score,
      (m.winner_member_id = _member_id) AS won
    FROM public.matches m
    WHERE (m.player_a_member_id = _member_id OR m.player_b_member_id = _member_id)
      AND m.match_date IS NOT NULL
      AND COALESCE(m.disputed, false) = false
  ),
  champ AS (
    SELECT
      'champ'::text AS source,
      cm.id AS match_id,
      NULL::text AS raw_source,
      CASE org.kind
        WHEN 'association' THEN 'regional'
        WHEN 'national' THEN 'national'
        ELSE 'club'
      END AS category,
      EXTRACT(YEAR FROM COALESCE(cm.scheduled_date, cm.created_at::date))::int AS season_year,
      COALESCE(cm.scheduled_date, cm.created_at::date) AS played_on,
      CASE
        WHEN cm.player_a_member_id = _member_id OR cm.partner_a_member_id = _member_id
          THEN cm.player_b_member_id
        ELSE cm.player_a_member_id
      END AS opponent_member_id,
      COALESCE(t.name, 'Club championship') AS event_label,
      cm.score AS score,
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
      ) AS won
    FROM public.club_champs_matches cm
    LEFT JOIN public.tournaments t ON t.id = cm.champ_id
    LEFT JOIN public.organisations org ON org.id = t.owner_org_id
    WHERE cm.status = 'completed'
      AND COALESCE(cm.is_bye, false) = false
      AND cm.winner_member_id IS NOT NULL
      AND (
        cm.player_a_member_id = _member_id OR cm.player_b_member_id = _member_id
        OR cm.partner_a_member_id = _member_id OR cm.partner_b_member_id = _member_id
      )
  ),
  league AS (
    SELECT
      'league'::text AS source,
      r.id AS match_id,
      NULL::text AS raw_source,
      'league'::text AS category,
      EXTRACT(YEAR FROM f.fixture_date)::int AS season_year,
      f.fixture_date AS played_on,
      CASE WHEN r.home_player_member_id = _member_id THEN r.away_player_member_id
           ELSE r.home_player_member_id END AS opponent_member_id,
      COALESCE(NULLIF(f.division, ''), 'League') AS event_label,
      COALESCE(r.home_games_won::text || '-' || r.away_games_won::text, '') AS score,
      CASE
        WHEN r.home_player_member_id = _member_id OR r.home_player2_member_id = _member_id THEN r.winner = 'home'
        ELSE r.winner = 'away'
      END AS won
    FROM public.league_match_results r
    JOIN public.platform_league_fixtures f ON f.id = r.fixture_id
    WHERE r.winner IS NOT NULL
      AND f.fixture_date IS NOT NULL
      AND (
        r.home_player_member_id = _member_id OR r.away_player_member_id = _member_id
        OR r.home_player2_member_id = _member_id OR r.away_player2_member_id = _member_id
      )
  ),
  nsa AS (
    SELECT
      'nsa'::text AS source,
      h.id AS match_id,
      NULL::text AS raw_source,
      'league'::text AS category,
      COALESCE(h.season_year, EXTRACT(YEAR FROM h.fixture_date)::int) AS season_year,
      h.fixture_date AS played_on,
      NULL::uuid AS opponent_member_id,
      COALESCE(NULLIF(h.league_label, ''), 'League') AS event_label,
      COALESCE(h.games_for::text || '-' || h.games_against::text, '') AS score,
      COALESCE(h.won, false) AS won
    FROM public.nsa_rubber_history h
    WHERE h.player_code IN (
      SELECT a.league_association_number
      FROM public.member_association_affiliations a
      WHERE a.club_member_id = _member_id
        AND a.league_association_number IS NOT NULL
    )
  ),
  unioned AS (
    SELECT source, match_id, category, season_year, played_on, opponent_member_id, event_label, score, won,
           NULL::text AS opponent_fallback
    FROM club_matches
    UNION ALL
    SELECT source, match_id, category, season_year, played_on, opponent_member_id, event_label, score, won, NULL
    FROM champ
    UNION ALL
    SELECT source, match_id, category, season_year, played_on, opponent_member_id, event_label, score, won, NULL
    FROM league
    UNION ALL
    SELECT n.source, n.match_id, n.category, n.season_year, n.played_on, n.opponent_member_id,
           n.event_label, n.score, n.won, h.opponent_name
    FROM nsa n
    JOIN public.nsa_rubber_history h ON h.id = n.match_id
  )
  SELECT
    u.source,
    u.match_id,
    u.category,
    u.season_year,
    u.played_on,
    u.opponent_member_id,
    COALESCE(om.name, u.opponent_fallback, 'Unknown') AS opponent_name,
    u.event_label,
    u.score,
    u.won
  FROM unioned u
  LEFT JOIN public.club_members om ON om.id = u.opponent_member_id
  WHERE (_season_year IS NULL OR u.season_year = _season_year)
    AND (_category IS NULL OR _category = 'total' OR u.category = _category)
    AND (_opponent_member_id IS NULL OR u.opponent_member_id = _opponent_member_id)
  ORDER BY u.played_on DESC NULLS LAST;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_member_stats_summary(
  _member_id uuid,
  _season_year integer DEFAULT NULL
)
RETURNS TABLE (
  category text,
  played bigint,
  won bigint,
  lost bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH rows AS (
    SELECT * FROM public.get_member_match_history(_member_id, _season_year, NULL, NULL)
  )
  SELECT r.category,
         count(*)::bigint,
         count(*) FILTER (WHERE r.won)::bigint,
         count(*) FILTER (WHERE NOT r.won)::bigint
  FROM rows r
  GROUP BY r.category
  UNION ALL
  SELECT 'total',
         count(*)::bigint,
         count(*) FILTER (WHERE r.won)::bigint,
         count(*) FILTER (WHERE NOT r.won)::bigint
  FROM rows r;
$$;

CREATE OR REPLACE FUNCTION public.get_member_stat_seasons(_member_id uuid)
RETURNS TABLE (season_year integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT h.season_year
  FROM public.get_member_match_history(_member_id, NULL, NULL, NULL) h
  WHERE h.season_year IS NOT NULL
  ORDER BY 1 DESC;
$$;

REVOKE ALL ON FUNCTION public.can_view_member_stats(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_member_match_history(uuid, integer, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_member_stats_summary(uuid, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_member_stat_seasons(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.can_view_member_stats(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_member_match_history(uuid, integer, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_member_stats_summary(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_member_stat_seasons(uuid) TO authenticated;
