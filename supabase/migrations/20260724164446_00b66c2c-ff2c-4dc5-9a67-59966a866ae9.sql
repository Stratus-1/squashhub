UPDATE public.club_champs_matches
SET status = 'scheduled',
    side_a_points = 0,
    side_b_points = 0,
    game_scores = NULL
WHERE status = 'in_progress'
  AND COALESCE(side_a_points, 0) = 0
  AND COALESCE(side_b_points, 0) = 0
  AND (game_scores IS NULL OR game_scores::text IN ('', 'null', '{}', '{"sets":[],"current":{"a":0,"b":0}}'));