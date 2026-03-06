-- Scope form_last5 to the active season (if any), so season resets don't "pull in" historical matches.

CREATE OR REPLACE FUNCTION public.recompute_profile_form_last5(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  f text;
  season_start date;
BEGIN
  SELECT starts_on INTO season_start
  FROM public.seasons
  WHERE is_active = true
  LIMIT 1;

  SELECT string_agg(res, '' ORDER BY ord) INTO f
  FROM (
    SELECT
      CASE WHEN m.winner_id = target_user_id THEN 'W' ELSE 'L' END AS res,
      row_number() OVER (ORDER BY m.match_date DESC, m.created_at DESC) AS ord
    FROM public.matches m
    WHERE m.confirmed = true
      AND COALESCE(m.is_friendly, false) = false
      AND (m.player_a = target_user_id OR m.player_b = target_user_id)
      AND (season_start IS NULL OR m.match_date >= season_start)
    ORDER BY m.match_date DESC, m.created_at DESC
    LIMIT 5
  ) t;

  UPDATE public.profiles
  SET
    form_last5 = COALESCE(f, ''),
    last_competitive_match_at = now(),
    updated_at = now()
  WHERE id = target_user_id;
END;
$$;

