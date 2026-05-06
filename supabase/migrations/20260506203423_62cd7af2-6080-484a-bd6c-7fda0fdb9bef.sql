CREATE OR REPLACE FUNCTION public._match_rollups_for_member(target_member_id uuid)
 RETURNS TABLE(match_id uuid, opponent_id text, match_date date, created_at timestamp with time zone, is_win boolean, duration_s integer, is_player_a boolean, score text, game_scores text, sets_for integer, sets_against integer, points_for integer, points_against integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT
      m.id AS match_id,
      (CASE WHEN m.player_a_member_id = target_member_id THEN m.player_b ELSE m.player_a END)::text AS opponent_id,
      m.match_date,
      m.created_at,
      (m.winner_member_id = target_member_id) AS is_win,
      NULLIF(m.duration_s, 0) AS duration_s,
      (m.player_a_member_id = target_member_id) AS is_player_a,
      m.score,
      m.game_scores
    FROM public.matches m
    WHERE m.confirmed = true
      AND COALESCE(m.disputed, false) = false
      AND (m.winner_id IS NOT NULL OR m.winner_member_id IS NOT NULL)
      AND (m.player_a_member_id = target_member_id OR m.player_b_member_id = target_member_id)
  ),
  per_match AS (
    SELECT
      b.match_id,
      b.opponent_id,
      b.match_date,
      b.created_at,
      b.is_win,
      b.duration_s,
      b.is_player_a,
      b.score,
      b.game_scores::text AS game_scores,
      CASE
        WHEN b.game_scores IS NOT NULL THEN (
          SELECT COALESCE(sum(
            CASE
              WHEN b.is_player_a
                THEN CASE WHEN (s.value->>'a')::int = 15 AND (s.value->>'b')::int BETWEEN 0 AND 14 THEN 1 ELSE 0 END
                ELSE CASE WHEN (s.value->>'b')::int = 15 AND (s.value->>'a')::int BETWEEN 0 AND 14 THEN 1 ELSE 0 END
            END
          ), 0)::int
          FROM jsonb_array_elements((b.game_scores::jsonb)->'sets') s
        )
        WHEN b.score ~ '^[0-9]+-[0-9]+$' THEN (
          CASE WHEN b.is_player_a THEN split_part(b.score, '-', 1)::int ELSE split_part(b.score, '-', 2)::int END
        )
        ELSE 0
      END AS sets_for,
      CASE
        WHEN b.game_scores IS NOT NULL THEN (
          SELECT COALESCE(sum(
            CASE
              WHEN b.is_player_a
                THEN CASE WHEN (s.value->>'b')::int = 15 AND (s.value->>'a')::int BETWEEN 0 AND 14 THEN 1 ELSE 0 END
                ELSE CASE WHEN (s.value->>'a')::int = 15 AND (s.value->>'b')::int BETWEEN 0 AND 14 THEN 1 ELSE 0 END
            END
          ), 0)::int
          FROM jsonb_array_elements((b.game_scores::jsonb)->'sets') s
        )
        WHEN b.score ~ '^[0-9]+-[0-9]+$' THEN (
          CASE WHEN b.is_player_a THEN split_part(b.score, '-', 2)::int ELSE split_part(b.score, '-', 1)::int END
        )
        ELSE 0
      END AS sets_against,
      CASE
        WHEN b.game_scores IS NOT NULL THEN (
          SELECT COALESCE(sum(CASE WHEN b.is_player_a THEN (s.value->>'a')::int ELSE (s.value->>'b')::int END), 0)::int
          FROM jsonb_array_elements((b.game_scores::jsonb)->'sets') s
        )
        ELSE 0
      END AS points_for,
      CASE
        WHEN b.game_scores IS NOT NULL THEN (
          SELECT COALESCE(sum(CASE WHEN b.is_player_a THEN (s.value->>'b')::int ELSE (s.value->>'a')::int END), 0)::int
          FROM jsonb_array_elements((b.game_scores::jsonb)->'sets') s
        )
        ELSE 0
      END AS points_against
    FROM base b
  ),
  league_codes AS (
    SELECT maa.league_association_number AS code
    FROM public.member_association_affiliations maa
    WHERE maa.club_member_id = target_member_id
      AND maa.league_association_number IS NOT NULL
      AND maa.league_association_number <> ''
  ),
  league_base AS (
    SELECT
      lmr.id AS match_id,
      (CASE WHEN lmr.home_player_code IN (SELECT code FROM league_codes)
            THEN COALESCE(lmr.away_player_name, lmr.away_player_code)
            ELSE COALESCE(lmr.home_player_name, lmr.home_player_code)
       END)::text AS opponent_id,
      COALESCE(plf.fixture_date, lmr.created_at::date) AS match_date,
      lmr.created_at,
      (lmr.winner = CASE WHEN lmr.home_player_code IN (SELECT code FROM league_codes) THEN 'home' ELSE 'away' END) AS is_win,
      NULL::int AS duration_s,
      (lmr.home_player_code IN (SELECT code FROM league_codes)) AS is_player_a,
      (lmr.home_games_won::text || '-' || lmr.away_games_won::text)::text AS score,
      lmr.game_scores
    FROM public.league_match_results lmr
    LEFT JOIN public.platform_league_fixtures plf ON plf.id = lmr.fixture_id
    WHERE lmr.winner IS NOT NULL
      AND (lmr.home_player_code IN (SELECT code FROM league_codes)
           OR lmr.away_player_code IN (SELECT code FROM league_codes))
  ),
  league_per_match AS (
    SELECT
      lb.match_id,
      lb.opponent_id,
      lb.match_date,
      lb.created_at,
      lb.is_win,
      lb.duration_s,
      lb.is_player_a,
      lb.score,
      lb.game_scores::text AS game_scores,
      CASE WHEN lb.is_player_a
           THEN COALESCE((SELECT count(*)::int FROM jsonb_array_elements(lb.game_scores) g WHERE (g->>'home')::int > (g->>'away')::int), 0)
           ELSE COALESCE((SELECT count(*)::int FROM jsonb_array_elements(lb.game_scores) g WHERE (g->>'away')::int > (g->>'home')::int), 0)
      END AS sets_for,
      CASE WHEN lb.is_player_a
           THEN COALESCE((SELECT count(*)::int FROM jsonb_array_elements(lb.game_scores) g WHERE (g->>'away')::int > (g->>'home')::int), 0)
           ELSE COALESCE((SELECT count(*)::int FROM jsonb_array_elements(lb.game_scores) g WHERE (g->>'home')::int > (g->>'away')::int), 0)
      END AS sets_against,
      CASE WHEN lb.is_player_a
           THEN COALESCE((SELECT sum((g->>'home')::int)::int FROM jsonb_array_elements(lb.game_scores) g), 0)
           ELSE COALESCE((SELECT sum((g->>'away')::int)::int FROM jsonb_array_elements(lb.game_scores) g), 0)
      END AS points_for,
      CASE WHEN lb.is_player_a
           THEN COALESCE((SELECT sum((g->>'away')::int)::int FROM jsonb_array_elements(lb.game_scores) g), 0)
           ELSE COALESCE((SELECT sum((g->>'home')::int)::int FROM jsonb_array_elements(lb.game_scores) g), 0)
      END AS points_against
    FROM league_base lb
  )
  SELECT * FROM per_match
  UNION ALL
  SELECT * FROM league_per_match;
$function$;