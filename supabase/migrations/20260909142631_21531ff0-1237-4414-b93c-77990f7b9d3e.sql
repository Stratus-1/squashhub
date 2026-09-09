
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS external_opponent_name TEXT,
  ADD COLUMN IF NOT EXISTS event_label TEXT,
  ADD COLUMN IF NOT EXISTS is_imported BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_matches_member_a ON public.matches (player_a_member_id);
CREATE INDEX IF NOT EXISTS idx_matches_member_b ON public.matches (player_b_member_id);

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS competition_level TEXT;

UPDATE public.tournaments t
SET competition_level = CASE
  WHEN t.event_type ILIKE '%national%' THEN 'national'
  WHEN t.event_type ILIKE '%provincial%' OR t.event_type ILIKE '%regional%' THEN 'regional'
  WHEN t.event_type ILIKE '%club%' THEN 'club'
  WHEN org.kind = 'national' THEN 'national'
  WHEN org.kind = 'association' THEN 'regional'
  ELSE 'club'
END
FROM (SELECT id FROM public.tournaments) x
LEFT JOIN public.organisations org ON org.id = (SELECT owner_org_id FROM public.tournaments tt WHERE tt.id = x.id)
WHERE t.id = x.id AND t.competition_level IS NULL;

CREATE OR REPLACE FUNCTION public.normalise_competition_level(_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE lower(coalesce(_raw, ''))
    WHEN 'national' THEN 'national'
    WHEN 'regional' THEN 'regional'
    WHEN 'provincial' THEN 'regional'
    WHEN 'league' THEN 'league'
    WHEN 'club' THEN 'club'
    ELSE 'club'
  END;
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
      public.normalise_competition_level(m.source_type) AS category,
      COALESCE(m.season_year, EXTRACT(YEAR FROM m.match_date)::int) AS season_year,
      m.match_date AS played_on,
      CASE WHEN m.player_a_member_id = _member_id THEN m.player_b_member_id
           ELSE m.player_a_member_id END AS opponent_member_id,
      COALESCE(NULLIF(m.event_label, ''), NULLIF(m.notes, ''), 'Club match') AS event_label,
      m.score AS score,
      (m.winner_member_id = _member_id) AS won,
      NULLIF(m.external_opponent_name, '') AS opponent_fallback
    FROM public.matches m
    WHERE (m.player_a_member_id = _member_id OR m.player_b_member_id = _member_id)
      AND m.match_date IS NOT NULL
      AND COALESCE(m.disputed, false) = false
  ),
  champ AS (
    SELECT
      'champ'::text AS source,
      cm.id AS match_id,
      public.normalise_competition_level(
        COALESCE(
          t.competition_level,
          CASE
            WHEN t.event_type ILIKE '%national%' THEN 'national'
            WHEN t.event_type ILIKE '%provincial%' OR t.event_type ILIKE '%regional%' THEN 'regional'
            ELSE 'club'
          END
        )
      ) AS category,
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
      ) AS won,
      NULL::text AS opponent_fallback
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
  league AS (
    SELECT
      'league'::text AS source,
      r.id AS match_id,
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
      END AS won,
      NULL::text AS opponent_fallback
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
      'league'::text AS category,
      COALESCE(h.season_year, EXTRACT(YEAR FROM h.fixture_date)::int) AS season_year,
      h.fixture_date AS played_on,
      NULL::uuid AS opponent_member_id,
      COALESCE(NULLIF(h.league_label, ''), 'League') AS event_label,
      COALESCE(h.games_for::text || '-' || h.games_against::text, '') AS score,
      COALESCE(h.won, false) AS won,
      h.opponent_name AS opponent_fallback
    FROM public.nsa_rubber_history h
    WHERE h.player_code IN (
      SELECT a.league_association_number
      FROM public.member_association_affiliations a
      WHERE a.club_member_id = _member_id
        AND a.league_association_number IS NOT NULL
    )
  ),
  unioned AS (
    SELECT * FROM club_matches
    UNION ALL SELECT * FROM champ
    UNION ALL SELECT * FROM league
    UNION ALL SELECT * FROM nsa
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

REVOKE ALL ON FUNCTION public.get_member_match_history(uuid, integer, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_member_match_history(uuid, integer, text, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.normalise_competition_level(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalise_competition_level(text) TO authenticated, service_role;
