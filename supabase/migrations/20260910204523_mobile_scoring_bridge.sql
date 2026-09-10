CREATE OR REPLACE FUNCTION public.mobile_internal_secret_ok(p_sync_secret text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.app_settings s
    WHERE s.key IN (
      'squashhub_mobile_internal_secret',
      'mobile_private_internal_secret',
      'lights_private_internal_secret'
    )
      AND s.value = p_sync_secret
      AND p_sync_secret IS NOT NULL
      AND length(p_sync_secret) >= 32
  );
$$;

REVOKE ALL ON FUNCTION public.mobile_internal_secret_ok(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mobile_internal_secret_ok(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mobile_scoring_side_label(p_primary uuid, p_partner uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH members AS (
    SELECT
      (SELECT name FROM public.club_members WHERE id = p_primary) AS primary_name,
      (SELECT name FROM public.club_members WHERE id = p_partner) AS partner_name
  )
  SELECT COALESCE(NULLIF(array_to_string(ARRAY[
    NULLIF(primary_name, ''),
    NULLIF(partner_name, '')
  ], ' & '), ''), 'Player')
  FROM members;
$$;

REVOKE ALL ON FUNCTION public.mobile_scoring_side_label(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mobile_scoring_side_label(uuid, uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mobile_scoreable_tournament_matches(
  p_sync_secret text,
  p_club_id uuid,
  p_member_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_matches jsonb;
BEGIN
  IF NOT public.mobile_internal_secret_ok(p_sync_secret) THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(row_payload ORDER BY sort_date, sort_time, name), '[]'::jsonb)
  INTO v_matches
  FROM (
    SELECT
      COALESCE(m.scheduled_date, CURRENT_DATE + 3650) AS sort_date,
      COALESCE(m.scheduled_time, '23:59:59'::time) AS sort_time,
      t.name,
      jsonb_build_object(
        'id', m.id,
        'tournamentId', t.id,
        'tournamentName', t.name,
        'clubId', t.club_id,
        'round', COALESCE(m.stage_label, m.stage, CASE WHEN m.round_number IS NOT NULL THEN 'Round ' || m.round_number::text ELSE NULL END),
        'court', COALESCE(c.name, CASE WHEN m.court_id IS NOT NULL THEN 'Court ' || m.court_id::text ELSE NULL END),
        'scheduledDate', m.scheduled_date,
        'scheduledTime', m.scheduled_time,
        'status', COALESCE(m.status, 'scheduled'),
        'sideA', jsonb_build_object(
          'memberId', m.player_a_member_id,
          'partnerMemberId', m.partner_a_member_id,
          'name', public.mobile_scoring_side_label(m.player_a_member_id, m.partner_a_member_id),
          'number', COALESCE(a.club_member_number, '')
        ),
        'sideB', jsonb_build_object(
          'memberId', m.player_b_member_id,
          'partnerMemberId', m.partner_b_member_id,
          'name', public.mobile_scoring_side_label(m.player_b_member_id, m.partner_b_member_id),
          'number', COALESCE(b.club_member_number, '')
        ),
        'rules', jsonb_build_object(
          'scoringMode', COALESCE(r.scoring_mode, t.scoring_mode, 'standard'),
          'pointsPerGame', COALESCE(r.points_per_game, t.points_per_game, 11),
          'bestOf', COALESCE(r.best_of, t.best_of, 5),
          'playAllGames', COALESCE(r.play_all_games, t.play_all_games, false),
          'winCondition', COALESCE(r.win_condition, t.win_condition, 'win_by_2'),
          'matchType', COALESCE(t.match_type, 'singles')
        ),
        'current', jsonb_build_object(
          'a', COALESCE(m.side_a_points, 0),
          'b', COALESCE(m.side_b_points, 0)
        ),
        'gameScores', m.game_scores,
        'updatedAt', m.updated_at
      ) AS row_payload
    FROM public.club_champs_matches m
    JOIN public.club_champs t ON t.id = m.champ_id
    LEFT JOIN public.tournament_rules r ON r.tournament_id = t.id
    LEFT JOIN public.club_members a ON a.id = m.player_a_member_id
    LEFT JOIN public.club_members b ON b.id = m.player_b_member_id
    LEFT JOIN public.courts c ON c.id = m.court_id
    WHERE t.club_id = p_club_id
      AND COALESCE(m.is_bye, false) = false
      AND COALESCE(m.status, 'scheduled') NOT IN ('completed', 'cancelled')
      AND p_member_id IN (m.player_a_member_id, m.player_b_member_id, m.partner_a_member_id, m.partner_b_member_id)
      AND COALESCE(r.scoring_mode, t.scoring_mode, 'standard') <> 'time_capped_points'
  ) rows;

  RETURN jsonb_build_object('matches', v_matches);
END;
$$;

REVOKE ALL ON FUNCTION public.mobile_scoreable_tournament_matches(text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mobile_scoreable_tournament_matches(text, uuid, uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mobile_get_tournament_scoring_match(
  p_sync_secret text,
  p_club_id uuid,
  p_member_id uuid,
  p_match_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_payload jsonb;
BEGIN
  IF NOT public.mobile_internal_secret_ok(p_sync_secret) THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT item INTO v_payload
  FROM jsonb_array_elements(public.mobile_scoreable_tournament_matches(p_sync_secret, p_club_id, p_member_id) -> 'matches') AS item
  WHERE (item ->> 'id')::uuid = p_match_id
  LIMIT 1;

  IF v_payload IS NULL THEN
    RAISE EXCEPTION 'Scoring match not found for this club member' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object('match', v_payload);
END;
$$;

REVOKE ALL ON FUNCTION public.mobile_get_tournament_scoring_match(text, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mobile_get_tournament_scoring_match(text, uuid, uuid, uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mobile_update_tournament_live_score(
  p_sync_secret text,
  p_club_id uuid,
  p_member_id uuid,
  p_match_id uuid,
  p_side_a_points integer,
  p_side_b_points integer,
  p_game_scores text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row public.club_champs_matches%ROWTYPE;
BEGIN
  IF NOT public.mobile_internal_secret_ok(p_sync_secret) THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT m.* INTO v_row
  FROM public.club_champs_matches m
  JOIN public.tournaments t ON t.id = m.champ_id
  WHERE m.id = p_match_id
    AND t.club_id = p_club_id
    AND p_member_id IN (m.player_a_member_id, m.player_b_member_id, m.partner_a_member_id, m.partner_b_member_id)
    AND COALESCE(m.status, 'scheduled') <> 'completed';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Scoring match not found for this club member' USING ERRCODE = '42501';
  END IF;

  UPDATE public.club_champs_matches
     SET status = 'in_progress',
         side_a_points = GREATEST(0, COALESCE(p_side_a_points, 0)),
         side_b_points = GREATEST(0, COALESCE(p_side_b_points, 0)),
         game_scores = p_game_scores,
         updated_at = now()
   WHERE id = p_match_id;

  RETURN jsonb_build_object('ok', true, 'status', 'in_progress');
END;
$$;

REVOKE ALL ON FUNCTION public.mobile_update_tournament_live_score(text, uuid, uuid, uuid, integer, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mobile_update_tournament_live_score(text, uuid, uuid, uuid, integer, integer, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.mobile_complete_tournament_score(
  p_sync_secret text,
  p_club_id uuid,
  p_member_id uuid,
  p_match_id uuid,
  p_winner_side text,
  p_score text,
  p_game_scores text,
  p_duration_s integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row public.club_champs_matches%ROWTYPE;
  v_winner uuid;
  v_marker_match_id uuid := gen_random_uuid();
BEGIN
  IF NOT public.mobile_internal_secret_ok(p_sync_secret) THEN
    RAISE EXCEPTION 'Unauthorized' USING ERRCODE = '42501';
  END IF;

  SELECT m.* INTO v_row
  FROM public.club_champs_matches m
  JOIN public.tournaments t ON t.id = m.champ_id
  WHERE m.id = p_match_id
    AND t.club_id = p_club_id
    AND p_member_id IN (m.player_a_member_id, m.player_b_member_id, m.partner_a_member_id, m.partner_b_member_id)
    AND COALESCE(m.status, 'scheduled') <> 'completed';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Scoring match not found for this club member' USING ERRCODE = '42501';
  END IF;

  IF p_winner_side = 'a' THEN
    v_winner := v_row.player_a_member_id;
  ELSIF p_winner_side = 'b' THEN
    v_winner := v_row.player_b_member_id;
  ELSE
    RAISE EXCEPTION 'Invalid winner side' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.matches (
    id,
    player_a_member_id,
    player_b_member_id,
    winner_member_id,
    score,
    game_scores,
    duration_s,
    submitted_by_member_id,
    confirmed,
    notes,
    club_id
  ) VALUES (
    v_marker_match_id,
    v_row.player_a_member_id,
    v_row.player_b_member_id,
    v_winner,
    p_score,
    p_game_scores,
    p_duration_s,
    p_member_id,
    true,
    'Marked from Squash Hub Player mobile app. Source: tournament ' || p_match_id::text,
    p_club_id
  );

  UPDATE public.club_champs_matches
     SET score = p_score,
         game_scores = p_game_scores,
         winner_member_id = v_winner,
         status = 'completed',
         side_a_points = 0,
         side_b_points = 0,
         updated_at = now()
   WHERE id = p_match_id;

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'completed',
    'matchResultId', v_marker_match_id,
    'winnerMemberId', v_winner
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mobile_complete_tournament_score(text, uuid, uuid, uuid, text, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mobile_complete_tournament_score(text, uuid, uuid, uuid, text, text, text, integer) TO anon, authenticated, service_role;
