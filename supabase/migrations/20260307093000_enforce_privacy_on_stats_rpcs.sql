-- Enforce profile privacy toggles at the RPC layer (so callers can't bypass UI).

-- 1) get_squash_totals: block if advanced stats are hidden (unless self/admin/moderator)
CREATE OR REPLACE FUNCTION public.get_squash_totals(target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
  allowed boolean;
  matches_count integer := 0;
  wins integer := 0;
  losses integer := 0;
  win_rate integer := 0;
  sets_for integer := 0;
  sets_against integer := 0;
  points_for integer := 0;
  points_against integer := 0;
  avg_duration_min integer := NULL;
  last_match_date date := NULL;
  current_streak_label text := '—';
  best_win_streak integer := 0;
  best_loss_streak integer := 0;
  current_is_win boolean := NULL;
  current_streak integer := 0;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF uid <> target_user_id AND NOT public.is_admin_or_moderator(uid) THEN
    SELECT privacy_show_advanced_stats INTO allowed
    FROM public.profiles
    WHERE id = target_user_id;
    IF COALESCE(allowed, true) = false THEN
      RAISE EXCEPTION 'Advanced squash stats are hidden';
    END IF;
  END IF;

  SELECT
    count(*)::int,
    count(*) FILTER (WHERE r.is_win)::int,
    count(*) FILTER (WHERE NOT r.is_win)::int,
    COALESCE(sum(r.sets_for), 0)::int,
    COALESCE(sum(r.sets_against), 0)::int,
    COALESCE(sum(r.points_for), 0)::int,
    COALESCE(sum(r.points_against), 0)::int,
    CASE
      WHEN count(r.duration_s) > 0 THEN round(avg(r.duration_s)::numeric / 60)::int
      ELSE NULL
    END,
    max(r.match_date)
  INTO
    matches_count, wins, losses, sets_for, sets_against, points_for, points_against, avg_duration_min, last_match_date
  FROM public._match_rollups_for_player(target_user_id) r;

  IF matches_count > 0 THEN
    win_rate := round((wins::numeric / matches_count::numeric) * 100)::int;
  END IF;

  -- Streaks
  WITH ordered AS (
    SELECT
      r.is_win,
      r.match_date,
      r.created_at,
      row_number() OVER (ORDER BY r.match_date DESC, r.created_at DESC) AS rn,
      CASE
        WHEN lag(r.is_win) OVER (ORDER BY r.match_date DESC, r.created_at DESC) IS DISTINCT FROM r.is_win
          THEN 1 ELSE 0
      END AS changed
    FROM public._match_rollups_for_player(target_user_id) r
    ORDER BY r.match_date DESC, r.created_at DESC
  ),
  groups AS (
    SELECT
      is_win,
      rn,
      sum(changed) OVER (ORDER BY rn) AS grp
    FROM ordered
  ),
  streaks AS (
    SELECT is_win, grp, count(*)::int AS len
    FROM groups
    GROUP BY is_win, grp
  )
  SELECT
    (SELECT o.is_win FROM ordered o WHERE o.rn = 1),
    (SELECT count(*)::int FROM groups g WHERE g.grp = (SELECT g2.grp FROM groups g2 WHERE g2.rn = 1) ),
    COALESCE((SELECT max(s.len) FROM streaks s WHERE s.is_win = true), 0)::int,
    COALESCE((SELECT max(s.len) FROM streaks s WHERE s.is_win = false), 0)::int
  INTO current_is_win, current_streak, best_win_streak, best_loss_streak;

  IF current_is_win IS NOT NULL THEN
    current_streak_label := (CASE WHEN current_is_win THEN 'W' ELSE 'L' END) || current_streak::text;
  END IF;

  RETURN jsonb_build_object(
    'matches', matches_count,
    'wins', wins,
    'losses', losses,
    'win_rate', win_rate,
    'avg_duration_min', avg_duration_min,
    'last_match_date', last_match_date,
    'current_streak', current_streak_label,
    'best_win_streak', best_win_streak,
    'best_loss_streak', best_loss_streak,
    'sets_for', sets_for,
    'sets_against', sets_against,
    'points_for', points_for,
    'points_against', points_against
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_squash_totals(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_squash_totals(uuid) TO authenticated;

-- 2) get_head_to_head: block if match history is hidden (unless self/admin/moderator)
CREATE OR REPLACE FUNCTION public.get_head_to_head(target_user_id uuid, limit_count integer DEFAULT 20)
RETURNS TABLE (
  opponent_id uuid,
  opponent_name text,
  matches integer,
  wins integer,
  losses integer,
  win_rate integer,
  last_match_date date,
  avg_duration_min integer,
  sets_for integer,
  sets_against integer,
  points_for integer,
  points_against integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
  allowed boolean;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF uid <> target_user_id AND NOT public.is_admin_or_moderator(uid) THEN
    SELECT privacy_show_recent_matches INTO allowed
    FROM public.profiles
    WHERE id = target_user_id;
    IF COALESCE(allowed, true) = false THEN
      RAISE EXCEPTION 'Match history is hidden';
    END IF;
  END IF;

  RETURN QUERY
  WITH r AS (
    SELECT * FROM public._match_rollups_for_player(target_user_id)
  ),
  agg AS (
    SELECT
      r.opponent_id,
      count(*)::int AS matches,
      count(*) FILTER (WHERE r.is_win)::int AS wins,
      count(*) FILTER (WHERE NOT r.is_win)::int AS losses,
      CASE WHEN count(*) > 0 THEN round((count(*) FILTER (WHERE r.is_win)::numeric / count(*)::numeric) * 100)::int ELSE 0 END AS win_rate,
      max(r.match_date) AS last_match_date,
      CASE WHEN count(r.duration_s) > 0 THEN round(avg(r.duration_s)::numeric / 60)::int ELSE NULL END AS avg_duration_min,
      COALESCE(sum(r.sets_for), 0)::int AS sets_for,
      COALESCE(sum(r.sets_against), 0)::int AS sets_against,
      COALESCE(sum(r.points_for), 0)::int AS points_for,
      COALESCE(sum(r.points_against), 0)::int AS points_against
    FROM r
    GROUP BY r.opponent_id
  )
  SELECT
    a.opponent_id,
    COALESCE(p.name, 'Unknown') AS opponent_name,
    a.matches,
    a.wins,
    a.losses,
    a.win_rate,
    a.last_match_date,
    a.avg_duration_min,
    a.sets_for,
    a.sets_against,
    a.points_for,
    a.points_against
  FROM agg a
  LEFT JOIN public.profiles p ON p.id = a.opponent_id
  ORDER BY a.matches DESC, a.last_match_date DESC
  LIMIT GREATEST(1, limit_count);
END;
$$;

REVOKE ALL ON FUNCTION public.get_head_to_head(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_head_to_head(uuid, integer) TO authenticated;

