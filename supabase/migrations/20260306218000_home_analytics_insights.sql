-- Home analytics: club insights + busiest time graph.
-- Uses bookings (past N days) to infer who plays when and session duration.

-- 1) Busiest-by-time-of-day (30-min buckets, counts across both courts)
CREATE OR REPLACE FUNCTION public.get_court_busyness(days_back integer DEFAULT 30)
RETURNS TABLE (
  slot text,
  bookings_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    to_char(s.slot_ts, 'HH24:MI') AS slot,
    COALESCE(c.cnt, 0)::int AS bookings_count
  FROM (
    SELECT generate_series(
      timestamp '2000-01-01 06:00',
      timestamp '2000-01-01 21:30',
      interval '30 minutes'
    ) AS slot_ts
  ) s
  LEFT JOIN (
    WITH b AS (
      SELECT *
      FROM public.bookings
      WHERE status = 'active'
        AND date >= (current_date - (greatest(1, least(coalesce(days_back, 30), 365)) - 1))
        AND date <= current_date
    )
    SELECT (gs.slot_ts)::time AS slot_time, count(*) AS cnt
    FROM b
    CROSS JOIN LATERAL generate_series(
      (timestamp '2000-01-01' + b.start_time),
      (timestamp '2000-01-01' + b.end_time) - interval '30 minutes',
      interval '30 minutes'
    ) AS gs(slot_ts)
    GROUP BY 1
  ) c
    ON c.slot_time = (s.slot_ts)::time
  ORDER BY s.slot_ts ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_court_busyness(integer) TO authenticated;

-- 2) Home insights summary (JSON)
CREATE OR REPLACE FUNCTION public.get_home_insights(days_back integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
  d integer := greatest(1, least(coalesce(days_back, 30), 365));
  from_date date := current_date - (d - 1);
  to_date date := current_date;
  payload jsonb;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  WITH b AS (
    SELECT *
    FROM public.bookings
    WHERE status = 'active'
      AND date >= from_date
      AND date <= to_date
  ),
  durations AS (
    SELECT
      count(*)::int AS sessions,
      avg(extract(epoch from (end_time - start_time)) / 60.0) AS avg_minutes
    FROM b
  ),
  slot_counts AS (
    SELECT
      to_char(gs.slot_ts, 'HH24:MI') AS slot,
      count(*)::int AS cnt
    FROM b
    CROSS JOIN LATERAL generate_series(
      (timestamp '2000-01-01' + b.start_time),
      (timestamp '2000-01-01' + b.end_time) - interval '30 minutes',
      interval '30 minutes'
    ) AS gs(slot_ts)
    GROUP BY 1
  ),
  busiest_slot AS (
    SELECT slot, cnt
    FROM slot_counts
    ORDER BY cnt DESC, slot ASC
    LIMIT 1
  ),
  day_counts AS (
    SELECT
      extract(isodow from date)::int AS isodow,
      count(*)::int AS cnt
    FROM b
    GROUP BY 1
  ),
  busiest_day AS (
    SELECT
      to_char(date '2020-01-06' + (isodow - 1), 'FMDay') AS day_name,
      cnt
    FROM day_counts
    ORDER BY cnt DESC, isodow ASC
    LIMIT 1
  ),
  player_counts AS (
    SELECT user_id AS player_id FROM b
    UNION ALL
    SELECT opponent_id AS player_id FROM b WHERE opponent_id IS NOT NULL
  ),
  top_players AS (
    SELECT
      p.id,
      p.name,
      count(*)::int AS sessions
    FROM player_counts pc
    JOIN public.profiles p ON p.id = pc.player_id
    GROUP BY p.id, p.name
    ORDER BY sessions DESC, p.name ASC
    LIMIT 5
  ),
  pair_counts AS (
    SELECT
      LEAST(user_id, opponent_id) AS a_id,
      GREATEST(user_id, opponent_id) AS b_id
    FROM b
    WHERE opponent_id IS NOT NULL
  ),
  top_pairs AS (
    SELECT
      a_id,
      b_id,
      pa.name AS a_name,
      pb.name AS b_name,
      count(*)::int AS sessions
    FROM pair_counts pc
    JOIN public.profiles pa ON pa.id = pc.a_id
    JOIN public.profiles pb ON pb.id = pc.b_id
    GROUP BY a_id, b_id, pa.name, pb.name
    ORDER BY sessions DESC, pa.name ASC, pb.name ASC
    LIMIT 5
  ),
  my_counts AS (
    SELECT
      count(*)::int AS sessions,
      avg(extract(epoch from (end_time - start_time)) / 60.0) AS avg_minutes
    FROM b
    WHERE user_id = uid OR opponent_id = uid
  )
  SELECT jsonb_build_object(
    'range', jsonb_build_object('from', from_date, 'to', to_date, 'days', d),
    'totals', jsonb_build_object(
      'sessions', (SELECT sessions FROM durations),
      'avg_session_minutes', COALESCE(round((SELECT avg_minutes FROM durations), 1), 0)
    ),
    'busiest', jsonb_build_object(
      'slot', (SELECT slot FROM busiest_slot),
      'slot_count', COALESCE((SELECT cnt FROM busiest_slot), 0),
      'day', (SELECT day_name FROM busiest_day),
      'day_count', COALESCE((SELECT cnt FROM busiest_day), 0)
    ),
    'top_players', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'name', name, 'sessions', sessions)) FROM top_players), '[]'::jsonb),
    'top_pairs', COALESCE((SELECT jsonb_agg(jsonb_build_object('a_id', a_id, 'a_name', a_name, 'b_id', b_id, 'b_name', b_name, 'sessions', sessions)) FROM top_pairs), '[]'::jsonb),
    'me', jsonb_build_object(
      'sessions', (SELECT sessions FROM my_counts),
      'avg_session_minutes', COALESCE(round((SELECT avg_minutes FROM my_counts), 1), 0)
    )
  ) INTO payload;

  RETURN payload;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_home_insights(integer) TO authenticated;

