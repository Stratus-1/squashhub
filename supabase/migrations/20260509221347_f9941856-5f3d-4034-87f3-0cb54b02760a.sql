
CREATE OR REPLACE FUNCTION public.get_club_analytics(days_back integer DEFAULT 30, p_club_id uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  from_date date;
BEGIN
  from_date := CURRENT_DATE - (days_back || ' days')::interval;

  WITH booking_stats AS (
    SELECT
      COUNT(*) AS total_bookings,
      COUNT(DISTINCT user_id) AS active_players,
      ROUND(AVG(EXTRACT(EPOCH FROM (end_time - start_time)) / 60))::integer AS avg_duration_min
    FROM public.bookings
    WHERE date >= from_date AND status = 'active'
      AND (p_club_id IS NULL OR club_id = p_club_id)
  ),
  hourly AS (
    SELECT
      EXTRACT(HOUR FROM start_time)::integer AS hour,
      COUNT(*) AS cnt
    FROM public.bookings
    WHERE date >= from_date AND status = 'active'
      AND (p_club_id IS NULL OR club_id = p_club_id)
    GROUP BY 1
    ORDER BY cnt DESC
    LIMIT 5
  ),
  top_players AS (
    SELECT p.id, p.name, COUNT(*) AS sessions
    FROM public.bookings b
    JOIN public.profiles p ON p.id = b.user_id
    WHERE b.date >= from_date AND b.status = 'active'
      AND (p_club_id IS NULL OR b.club_id = p_club_id)
    GROUP BY p.id, p.name
    ORDER BY sessions DESC
    LIMIT 5
  ),
  match_stats AS (
    SELECT
      COUNT(*) AS total_matches,
      COUNT(*) FILTER (WHERE confirmed) AS confirmed_matches
    FROM public.matches
    WHERE match_date >= from_date
      AND (p_club_id IS NULL OR club_id = p_club_id)
  )
  SELECT jsonb_build_object(
    'total_bookings', (SELECT total_bookings FROM booking_stats),
    'active_players', (SELECT active_players FROM booking_stats),
    'avg_duration_min', (SELECT avg_duration_min FROM booking_stats),
    'total_matches', (SELECT total_matches FROM match_stats),
    'confirmed_matches', (SELECT confirmed_matches FROM match_stats),
    'busiest_hours', (SELECT COALESCE(jsonb_agg(jsonb_build_object('hour', hour, 'count', cnt)), '[]'::jsonb) FROM hourly),
    'top_players', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'sessions', sessions)), '[]'::jsonb) FROM top_players)
  ) INTO result;

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_personal_analytics(target_user_id uuid, days_back integer DEFAULT 90, p_club_id uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result jsonb;
  from_date date;
  target_member_id uuid;
BEGIN
  from_date := CURRENT_DATE - (days_back || ' days')::interval;

  SELECT id INTO target_member_id FROM public.club_members
  WHERE user_id = target_user_id
    AND (p_club_id IS NULL OR club_id = p_club_id)
  ORDER BY joined_at DESC LIMIT 1;

  WITH my_bookings AS (
    SELECT * FROM public.bookings
    WHERE ((club_member_id IS NOT NULL AND club_member_id = target_member_id) OR user_id = target_user_id)
    AND date >= from_date AND status = 'active'
    AND (p_club_id IS NULL OR club_id = p_club_id)
  ),
  court_usage AS (SELECT court_id, COUNT(*) AS cnt FROM my_bookings GROUP BY court_id ORDER BY cnt DESC),
  hourly AS (SELECT EXTRACT(HOUR FROM start_time)::integer AS hour, COUNT(*) AS cnt FROM my_bookings GROUP BY 1 ORDER BY cnt DESC LIMIT 5),
  weekly_wins AS (
    SELECT
      DATE_TRUNC('week', m.match_date)::date AS week,
      COUNT(*) AS matches,
      COUNT(*) FILTER (WHERE m.winner_member_id = target_member_id OR m.winner_id = target_user_id) AS wins
    FROM public.matches m
    WHERE m.confirmed = true AND m.match_date >= from_date
      AND (p_club_id IS NULL OR m.club_id = p_club_id)
      AND (m.player_a_member_id = target_member_id OR m.player_b_member_id = target_member_id
        OR m.player_a = target_user_id OR m.player_b = target_user_id)
    GROUP BY 1 ORDER BY 1
  ),
  day_of_week AS (SELECT EXTRACT(DOW FROM date)::integer AS dow, COUNT(*) AS cnt FROM my_bookings GROUP BY 1 ORDER BY cnt DESC LIMIT 3)
  SELECT jsonb_build_object(
    'court_usage', (SELECT COALESCE(jsonb_agg(jsonb_build_object('court_id', court_id, 'count', cnt)), '[]'::jsonb) FROM court_usage),
    'peak_hours', (SELECT COALESCE(jsonb_agg(jsonb_build_object('hour', hour, 'count', cnt)), '[]'::jsonb) FROM hourly),
    'weekly_performance', (SELECT COALESCE(jsonb_agg(jsonb_build_object('week', week, 'matches', matches, 'wins', wins)), '[]'::jsonb) FROM weekly_wins),
    'favourite_days', (SELECT COALESCE(jsonb_agg(jsonb_build_object('dow', dow, 'count', cnt)), '[]'::jsonb) FROM day_of_week),
    'total_bookings', (SELECT COUNT(*) FROM my_bookings),
    'total_courts_used', (SELECT COUNT(DISTINCT court_id) FROM my_bookings)
  ) INTO result;

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_match_of_the_week(p_club_id uuid DEFAULT NULL)
 RETURNS TABLE(match_id uuid, player_a uuid, player_b uuid, player_a_name text, player_b_name text, winner_id uuid, score text, game_scores text, match_date date, closeness_score integer, player_a_member_id uuid, player_b_member_id uuid, winner_member_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH recent_matches AS (
    SELECT m.*
    FROM public.matches m
    WHERE m.confirmed = true
      AND m.match_date >= (CURRENT_DATE - INTERVAL '7 days')
      AND m.game_scores IS NOT NULL
      AND (p_club_id IS NULL OR m.club_id = p_club_id)
  ),
  scored AS (
    SELECT
      rm.id AS s_match_id,
      rm.player_a AS s_player_a,
      rm.player_b AS s_player_b,
      rm.player_a_member_id AS s_player_a_member_id,
      rm.player_b_member_id AS s_player_b_member_id,
      rm.winner_id AS s_winner_id,
      rm.winner_member_id AS s_winner_member_id,
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
    COALESCE(cma.name, pa.name, '')::text,
    COALESCE(cmb.name, pb.name, '')::text,
    s.s_winner_id,
    s.s_score,
    s.s_game_scores,
    s.s_match_date,
    s.s_closeness_score,
    s.s_player_a_member_id,
    s.s_player_b_member_id,
    s.s_winner_member_id
  FROM scored s
  LEFT JOIN public.profiles pa ON pa.id = s.s_player_a
  LEFT JOIN public.profiles pb ON pb.id = s.s_player_b
  LEFT JOIN public.club_members cma ON cma.id = s.s_player_a_member_id
  LEFT JOIN public.club_members cmb ON cmb.id = s.s_player_b_member_id
  ORDER BY s.s_closeness_score DESC, s.s_match_date DESC
  LIMIT 1;
END;
$function$;
