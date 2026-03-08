-- Admin tool: record a match manually (for when players forgot to book/track a game)
-- - Inserts a match between two players
-- - Optionally auto-confirms as admin so stats update immediately
-- - Friendly matches can be recorded but never affect ladder/stats

CREATE OR REPLACE FUNCTION public.admin_record_manual_match(
  player_a uuid,
  player_b uuid,
  winner_id uuid,
  match_date date,
  score text DEFAULT NULL,
  game_scores jsonb DEFAULT NULL,
  court_id integer DEFAULT NULL,
  duration_s integer DEFAULT NULL,
  notes text DEFAULT NULL,
  is_friendly boolean DEFAULT false,
  auto_confirm boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
  mid uuid;
  gs_text text;
BEGIN
  uid := auth.uid();
  IF uid IS NULL OR NOT public.is_admin_or_moderator(uid) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF player_a IS NULL OR player_b IS NULL OR player_a = player_b THEN
    RAISE EXCEPTION 'player_a and player_b must be different';
  END IF;

  IF winner_id IS NULL OR winner_id NOT IN (player_a, player_b) THEN
    RAISE EXCEPTION 'winner_id must be one of the players';
  END IF;

  IF match_date IS NULL THEN
    RAISE EXCEPTION 'match_date is required';
  END IF;

  IF duration_s IS NOT NULL AND duration_s < 0 THEN
    RAISE EXCEPTION 'duration_s must be >= 0';
  END IF;

  gs_text := CASE WHEN game_scores IS NULL THEN NULL ELSE game_scores::text END;

  INSERT INTO public.matches (
    player_a,
    player_b,
    winner_id,
    match_date,
    score,
    game_scores,
    court_id,
    duration_s,
    notes,
    is_friendly,
    submitted_by,
    confirmed,
    disputed
  )
  VALUES (
    player_a,
    player_b,
    winner_id,
    match_date,
    NULLIF(trim(COALESCE(score, '')), ''),
    gs_text,
    court_id,
    duration_s,
    NULLIF(trim(COALESCE(notes, '')), ''),
    COALESCE(is_friendly, false),
    NULL,
    false,
    false
  )
  RETURNING id INTO mid;

  IF auto_confirm IS TRUE THEN
    PERFORM public.admin_confirm_match(mid);
  END IF;

  PERFORM public._audit_log_insert(
    'manual_match_recorded',
    'matches',
    mid,
    'Manual match recorded',
    jsonb_build_object(
      'match_id', mid,
      'player_a', player_a,
      'player_b', player_b,
      'winner_id', winner_id,
      'match_date', match_date,
      'court_id', court_id,
      'duration_s', duration_s,
      'is_friendly', COALESCE(is_friendly, false),
      'auto_confirm', COALESCE(auto_confirm, true)
    )
  );

  RETURN mid;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_record_manual_match(uuid, uuid, uuid, date, text, jsonb, integer, integer, text, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_record_manual_match(uuid, uuid, uuid, date, text, jsonb, integer, integer, text, boolean, boolean) TO authenticated;

