
DROP FUNCTION IF EXISTS public._match_rollups_for_member(uuid);

CREATE OR REPLACE FUNCTION public._match_rollups_for_member(target_member_id uuid)
RETURNS TABLE(
  match_id uuid,
  opponent_id text,
  match_date date,
  created_at timestamptz,
  is_win boolean,
  duration_s integer,
  is_player_a boolean,
  score text,
  game_scores text,
  sets_for integer,
  sets_against integer,
  points_for integer,
  points_against integer
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      m.id AS match_id,
      CASE WHEN m.player_a_member_id = target_member_id THEN m.player_b ELSE m.player_a END AS opponent_id,
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
      b.game_scores,
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
  )
  SELECT * FROM per_match;
$$;

CREATE OR REPLACE FUNCTION public.apply_confirmed_match_effects()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  winner_user uuid;
  loser_user uuid;
  winner_member uuid;
  loser_member uuid;
  c_challenger uuid;
  c_opponent uuid;
  c_challenger_member uuid;
  c_opponent_member uuid;
  challenger_rank integer;
  opponent_rank integer;
  challenger_member_id uuid;
  challenger_group text;
  opponent_group text;
  v_club_id uuid;
BEGIN
  IF NEW.confirmed IS NOT TRUE OR OLD.confirmed IS TRUE THEN
    RETURN NEW;
  END IF;

  winner_member := NEW.winner_member_id;
  loser_member := CASE
    WHEN winner_member = NEW.player_a_member_id THEN NEW.player_b_member_id
    ELSE NEW.player_a_member_id
  END;

  winner_user := NEW.winner_id;
  IF winner_user IS NULL AND winner_member IS NOT NULL THEN
    SELECT user_id INTO winner_user FROM public.club_members WHERE id = winner_member;
  END IF;

  IF winner_user IS NULL THEN
    RETURN NEW;
  END IF;

  loser_user := CASE WHEN winner_user = NEW.player_a THEN NEW.player_b ELSE NEW.player_a END;
  IF loser_user IS NULL AND loser_member IS NOT NULL THEN
    SELECT user_id INTO loser_user FROM public.club_members WHERE id = loser_member;
  END IF;

  UPDATE public.profiles
  SET
    matches_played = matches_played + 1,
    wins = wins + CASE WHEN id = winner_user THEN 1 ELSE 0 END,
    losses = losses + CASE WHEN id = loser_user THEN 1 ELSE 0 END,
    updated_at = now()
  WHERE id IN (winner_user, loser_user);

  IF NEW.challenge_id IS NOT NULL THEN
    SELECT challenger_id, opponent_id, challenger_member_id, opponent_member_id, club_id
    INTO c_challenger, c_opponent, c_challenger_member, c_opponent_member, v_club_id
    FROM public.challenges WHERE id = NEW.challenge_id;

    IF v_club_id IS NULL THEN v_club_id := NEW.club_id; END IF;

    IF FOUND AND (
      (winner_user IS NOT NULL AND winner_user = c_challenger) OR
      (winner_member IS NOT NULL AND winner_member = c_challenger_member)
    ) THEN
      IF c_challenger_member IS NOT NULL THEN
        SELECT cm.id, cm.ladder_position,
          CASE WHEN lower(COALESCE(cm.gender, '')) IN ('female', 'ladies', 'f') THEN 'ladies' ELSE 'men' END
        INTO challenger_member_id, challenger_rank, challenger_group
        FROM public.club_members cm WHERE cm.id = c_challenger_member;
      ELSE
        SELECT cm.id, cm.ladder_position,
          CASE WHEN lower(COALESCE(cm.gender, '')) IN ('female', 'ladies', 'f') THEN 'ladies' ELSE 'men' END
        INTO challenger_member_id, challenger_rank, challenger_group
        FROM public.club_members cm
        WHERE cm.user_id = c_challenger AND (v_club_id IS NULL OR cm.club_id = v_club_id)
        ORDER BY cm.joined_at DESC LIMIT 1;
      END IF;

      IF c_opponent_member IS NOT NULL THEN
        SELECT cm.ladder_position,
          CASE WHEN lower(COALESCE(cm.gender, '')) IN ('female', 'ladies', 'f') THEN 'ladies' ELSE 'men' END
        INTO opponent_rank, opponent_group
        FROM public.club_members cm WHERE cm.id = c_opponent_member;
      ELSE
        SELECT cm.ladder_position,
          CASE WHEN lower(COALESCE(cm.gender, '')) IN ('female', 'ladies', 'f') THEN 'ladies' ELSE 'men' END
        INTO opponent_rank, opponent_group
        FROM public.club_members cm
        WHERE cm.user_id = c_opponent AND (v_club_id IS NULL OR cm.club_id = v_club_id)
        ORDER BY cm.joined_at DESC LIMIT 1;
      END IF;

      IF challenger_rank IS NOT NULL AND opponent_rank IS NOT NULL
         AND challenger_group = opponent_group AND challenger_rank > opponent_rank THEN
        UPDATE public.club_members cm
        SET ladder_position = cm.ladder_position + 1, updated_at = now()
        WHERE (v_club_id IS NULL OR cm.club_id = v_club_id)
          AND ((challenger_group = 'ladies' AND lower(COALESCE(cm.gender, '')) IN ('female', 'ladies', 'f'))
            OR (challenger_group = 'men' AND lower(COALESCE(cm.gender, '')) NOT IN ('female', 'ladies', 'f')))
          AND cm.ladder_position IS NOT NULL
          AND cm.ladder_position >= opponent_rank AND cm.ladder_position < challenger_rank
          AND cm.id <> challenger_member_id;

        UPDATE public.club_members SET ladder_position = opponent_rank, updated_at = now()
        WHERE id = challenger_member_id;
      END IF;
    END IF;

    UPDATE public.challenges SET status = 'completed', updated_at = now()
    WHERE id = NEW.challenge_id AND status <> 'completed';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_confirmed_match_effects_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  winner_user uuid;
  loser_user uuid;
  loser_member uuid;
BEGIN
  IF NEW.confirmed IS NOT TRUE THEN RETURN NEW; END IF;
  IF NEW.winner_id IS NULL AND NEW.winner_member_id IS NULL THEN RETURN NEW; END IF;

  winner_user := NEW.winner_id;
  IF winner_user IS NULL AND NEW.winner_member_id IS NOT NULL THEN
    SELECT user_id INTO winner_user FROM public.club_members WHERE id = NEW.winner_member_id;
  END IF;
  IF winner_user IS NULL THEN RETURN NEW; END IF;

  loser_user := CASE WHEN winner_user = NEW.player_a THEN NEW.player_b ELSE NEW.player_a END;
  IF loser_user IS NULL THEN
    loser_member := CASE WHEN NEW.winner_member_id = NEW.player_a_member_id THEN NEW.player_b_member_id ELSE NEW.player_a_member_id END;
    IF loser_member IS NOT NULL THEN
      SELECT user_id INTO loser_user FROM public.club_members WHERE id = loser_member;
    END IF;
  END IF;

  UPDATE public.profiles
  SET matches_played = matches_played + 1,
      wins = wins + CASE WHEN id = winner_user THEN 1 ELSE 0 END,
      losses = losses + CASE WHEN id = loser_user THEN 1 ELSE 0 END,
      updated_at = now()
  WHERE id IN (winner_user, loser_user);

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_personal_analytics(target_user_id uuid, days_back integer DEFAULT 90)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  from_date date;
  target_member_id uuid;
BEGIN
  from_date := CURRENT_DATE - (days_back || ' days')::interval;

  SELECT id INTO target_member_id FROM public.club_members
  WHERE user_id = target_user_id ORDER BY joined_at DESC LIMIT 1;

  WITH my_bookings AS (
    SELECT * FROM public.bookings
    WHERE ((club_member_id IS NOT NULL AND club_member_id = target_member_id) OR user_id = target_user_id)
    AND date >= from_date AND status = 'active'
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
$$;
