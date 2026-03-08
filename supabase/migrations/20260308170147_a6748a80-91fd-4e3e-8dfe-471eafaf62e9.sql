
-- ==========================================
-- SEASONS & AWARDS
-- ==========================================
CREATE TABLE public.seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'upcoming',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.seasons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Seasons readable by all authenticated" ON public.seasons
  FOR SELECT TO authenticated USING (true);

CREATE TABLE public.season_awards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id uuid NOT NULL REFERENCES public.seasons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  award_type text NOT NULL,
  award_label text NOT NULL DEFAULT '',
  stat_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.season_awards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Awards readable by all authenticated" ON public.season_awards
  FOR SELECT TO authenticated USING (true);

-- ==========================================
-- RECURRING BOOKINGS
-- ==========================================
CREATE TABLE public.recurring_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  court_id integer NOT NULL REFERENCES public.courts(id),
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.recurring_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own recurring bookings" ON public.recurring_bookings
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can create own recurring bookings" ON public.recurring_bookings
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own recurring bookings" ON public.recurring_bookings
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own recurring bookings" ON public.recurring_bookings
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- ==========================================
-- MATCH DISPUTES
-- ==========================================
CREATE TABLE public.match_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  raised_by uuid NOT NULL,
  reason text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open',
  resolution text,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.match_disputes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Disputes readable by all authenticated" ON public.match_disputes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can raise disputes" ON public.match_disputes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = raised_by);

CREATE POLICY "Admins can update disputes" ON public.match_disputes
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- ==========================================
-- MATCH OF THE WEEK FUNCTION
-- ==========================================
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
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
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
      rm.id AS match_id,
      rm.player_a,
      rm.player_b,
      rm.winner_id,
      rm.score,
      rm.game_scores,
      rm.match_date,
      -- Calculate closeness: more games = closer match, tighter scores = closer
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
      ) AS closeness_score
    FROM recent_matches rm
  )
  SELECT
    s.match_id,
    s.player_a,
    s.player_b,
    COALESCE(pa.name, '') AS player_a_name,
    COALESCE(pb.name, '') AS player_b_name,
    s.winner_id,
    s.score,
    s.game_scores,
    s.match_date,
    s.closeness_score
  FROM scored s
  LEFT JOIN public.profiles pa ON pa.id = s.player_a
  LEFT JOIN public.profiles pb ON pb.id = s.player_b
  ORDER BY s.closeness_score DESC, s.match_date DESC
  LIMIT 1;
END;
$$;

-- ==========================================
-- CLUB ANALYTICS FUNCTION
-- ==========================================
CREATE OR REPLACE FUNCTION public.get_club_analytics(days_back integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
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
  ),
  hourly AS (
    SELECT
      EXTRACT(HOUR FROM start_time)::integer AS hour,
      COUNT(*) AS cnt
    FROM public.bookings
    WHERE date >= from_date AND status = 'active'
    GROUP BY 1
    ORDER BY cnt DESC
    LIMIT 5
  ),
  top_players AS (
    SELECT p.id, p.name, COUNT(*) AS sessions
    FROM public.bookings b
    JOIN public.profiles p ON p.id = b.user_id
    WHERE b.date >= from_date AND b.status = 'active'
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
$$;

-- ==========================================
-- PERSONAL ANALYTICS FUNCTION
-- ==========================================
CREATE OR REPLACE FUNCTION public.get_personal_analytics(target_user_id uuid, days_back integer DEFAULT 90)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  result jsonb;
  from_date date;
BEGIN
  from_date := CURRENT_DATE - (days_back || ' days')::interval;

  WITH my_bookings AS (
    SELECT * FROM public.bookings
    WHERE user_id = target_user_id AND date >= from_date AND status = 'active'
  ),
  court_usage AS (
    SELECT court_id, COUNT(*) AS cnt
    FROM my_bookings
    GROUP BY court_id
    ORDER BY cnt DESC
  ),
  hourly AS (
    SELECT EXTRACT(HOUR FROM start_time)::integer AS hour, COUNT(*) AS cnt
    FROM my_bookings
    GROUP BY 1 ORDER BY cnt DESC LIMIT 5
  ),
  weekly_wins AS (
    SELECT
      DATE_TRUNC('week', m.match_date)::date AS week,
      COUNT(*) AS matches,
      COUNT(*) FILTER (WHERE m.winner_id = target_user_id) AS wins
    FROM public.matches m
    WHERE (m.player_a = target_user_id OR m.player_b = target_user_id)
      AND m.confirmed = true
      AND m.match_date >= from_date
    GROUP BY 1
    ORDER BY 1
  ),
  day_of_week AS (
    SELECT EXTRACT(DOW FROM date)::integer AS dow, COUNT(*) AS cnt
    FROM my_bookings
    GROUP BY 1 ORDER BY cnt DESC LIMIT 3
  )
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
$$;

-- Enable realtime for new tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.seasons;
ALTER PUBLICATION supabase_realtime ADD TABLE public.match_disputes;
