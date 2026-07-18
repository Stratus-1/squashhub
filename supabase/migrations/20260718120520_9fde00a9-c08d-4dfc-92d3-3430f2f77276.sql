CREATE OR REPLACE FUNCTION public.delete_league_round_cascade(_round_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_round public.league_rounds%ROWTYPE;
  v_start_date date;
  v_is_super_admin boolean;
  v_fixture_ids uuid[] := ARRAY[]::uuid[];
  v_booking_count integer := 0;
  v_lineup_count integer := 0;
  v_fixture_result_count integer := 0;
  v_match_result_count integer := 0;
  v_fixture_count integer := 0;
BEGIN
  SELECT * INTO v_round
  FROM public.league_rounds
  WHERE id = _round_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'League round not found';
  END IF;

  v_is_super_admin := public.has_role(auth.uid(), 'admin'::public.app_role);

  IF NOT v_is_super_admin AND NOT public.is_club_admin_or_permitted(auth.uid(), v_round.club_id, 'leagues') THEN
    RAISE EXCEPTION 'Not allowed to delete this league round';
  END IF;

  SELECT COALESCE(MIN(fixture_date), v_round.round_date)
  INTO v_start_date
  FROM public.platform_league_fixtures
  WHERE round_id = _round_id;

  IF NOT v_is_super_admin AND v_start_date <= CURRENT_DATE THEN
    RAISE EXCEPTION 'Only super admins can delete a league round once fixtures have started';
  END IF;

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
  INTO v_fixture_ids
  FROM public.platform_league_fixtures
  WHERE round_id = _round_id;

  UPDATE public.bookings b
  SET status = 'cancelled', updated_at = now()
  WHERE b.id IN (
    SELECT booking_id
    FROM public.platform_league_fixtures
    WHERE round_id = _round_id
      AND booking_id IS NOT NULL
  )
  AND b.status <> 'cancelled';
  GET DIAGNOSTICS v_booking_count = ROW_COUNT;

  IF array_length(v_fixture_ids, 1) IS NOT NULL THEN
    DELETE FROM public.league_fixture_lineups
    WHERE fixture_id = ANY(v_fixture_ids);
    GET DIAGNOSTICS v_lineup_count = ROW_COUNT;

    DELETE FROM public.league_match_results
    WHERE fixture_id = ANY(v_fixture_ids);
    GET DIAGNOSTICS v_match_result_count = ROW_COUNT;

    DELETE FROM public.league_fixture_results
    WHERE fixture_id = ANY(v_fixture_ids);
    GET DIAGNOSTICS v_fixture_result_count = ROW_COUNT;

    DELETE FROM public.platform_league_fixtures
    WHERE id = ANY(v_fixture_ids);
    GET DIAGNOSTICS v_fixture_count = ROW_COUNT;
  END IF;

  DELETE FROM public.league_rounds
  WHERE id = _round_id;

  RETURN jsonb_build_object(
    'fixtures_deleted', v_fixture_count,
    'bookings_cancelled', v_booking_count,
    'lineups_deleted', v_lineup_count,
    'fixture_results_deleted', v_fixture_result_count,
    'match_results_deleted', v_match_result_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_league_round_cascade(uuid) TO authenticated;