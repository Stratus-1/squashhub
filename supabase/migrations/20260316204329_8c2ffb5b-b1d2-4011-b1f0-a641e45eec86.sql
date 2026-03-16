CREATE OR REPLACE FUNCTION public.get_match_of_the_week()
RETURNS TABLE(
  match_id uuid,
  player_a uuid,
  player_b uuid,
  player_a_name text,
  player_b_name text,
  winner_id uuid,
  score text,
  game_scores text,
  match_date date,
  closeness_score integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH recent_matches AS (
    SELECT m.*
    FROM public.matches m
    WHERE m.confirmed = true
      AND m.match_date >= (CURRENT_DATE - INTERVAL '7 days')
      AND m.game_scores IS NOT NULL
  ),
  scored AS (
    SELECT
      rm.id AS s_match_id,
      rm.player_a AS s_player_a,
      rm.player_b AS s_player_b,
      rm.player_a_member_id,
      rm.player_b_member_id,
      rm.winner_id AS s_winner_id,
      rm.score AS s_score,
      rm.game_scores AS s_game_scores,
      rm.match_date AS s_match_date,
      (
        CASE
          WHEN rm.game_scores IS NOT NULL THEN
            jsonb_array_length(
              CASE
                WHEN (rm.game_scores::jsonb -> 'sets') IS NOT NULL
                THEN rm.game_scores::jsonb -> 'sets'
                ELSE '[]'::jsonb
              END
            ) * 10
          ELSE 0
        END
      ) AS s_closeness_score
    FROM recent_matches rm
  )
  SELECT
    s.s_match_id,
    s.s_player_a,
    s.s_player_b,
    COALESCE(cma.name, pa.name, '')::text AS player_a_name,
    COALESCE(cmb.name, pb.name, '')::text AS player_b_name,
    s.s_winner_id,
    s.s_score,
    s.s_game_scores,
    s.s_match_date,
    s.s_closeness_score
  FROM scored s
  LEFT JOIN public.profiles pa ON pa.id = s.s_player_a
  LEFT JOIN public.profiles pb ON pb.id = s.s_player_b
  LEFT JOIN public.club_members cma ON cma.id = s.player_a_member_id
  LEFT JOIN public.club_members cmb ON cmb.id = s.player_b_member_id
  ORDER BY s.s_closeness_score DESC, s.s_match_date DESC
  LIMIT 1;
END;
$$;