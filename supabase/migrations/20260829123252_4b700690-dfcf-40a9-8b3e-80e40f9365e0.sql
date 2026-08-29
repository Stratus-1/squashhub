CREATE OR REPLACE FUNCTION public.is_rankable_member(_member_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.id = _member_id
      AND COALESCE(cm.role::text,'member') <> 'visitor'
      AND COALESCE(cm.billing_exempt,false) IS NOT TRUE
      AND cm.ladder_position IS NOT NULL
      AND cm.ladder_position > 0
      AND COALESCE(cm.status::text,'active') = 'active'
  );
$$;
REVOKE ALL ON FUNCTION public.is_rankable_member(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.is_rankable_member(uuid) TO authenticated, service_role;

-- Awards: skip anyone who is not a true, ladder-listed member.
CREATE OR REPLACE FUNCTION public.award_ranking_points_for_result(_club_id uuid, _winner_member_id uuid, _loser_member_id uuid, _source_type text, _source_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  c RECORD;
  lc RECORD;
  w_rank integer; l_rank integer;
  w_points numeric; l_points numeric;
  gap integer;
  w_delta numeric := 0; l_delta numeric := 0;
  v_mode text := 'formula';
  v_pending uuid;
  v_wb numeric; v_lb numeric;
BEGIN
  IF _winner_member_id IS NULL OR _loser_member_id IS NULL OR _winner_member_id = _loser_member_id THEN
    RETURN NULL;
  END IF;

  -- Only true members who sit on the club ladder earn or lose ranking points.
  IF NOT public.is_rankable_member(_winner_member_id)
     OR NOT public.is_rankable_member(_loser_member_id) THEN
    RETURN NULL;
  END IF;

  SELECT ranking_points_enabled, points_base_win, points_upset_bonus_per_rank,
         points_favourite_win_min, points_loser_deduction,
         points_from_challenges, points_from_leagues, points_from_tournaments
    INTO c FROM public.clubs WHERE id = _club_id;
  IF NOT FOUND OR COALESCE(c.ranking_points_enabled,false) IS NOT TRUE THEN RETURN NULL; END IF;

  IF _source_type = 'challenge' AND c.points_from_challenges IS NOT TRUE THEN RETURN NULL; END IF;
  IF _source_type = 'league' AND c.points_from_leagues IS NOT TRUE THEN RETURN NULL; END IF;
  IF _source_type = 'tournament' AND c.points_from_tournaments IS NOT TRUE THEN RETURN NULL; END IF;

  SELECT * INTO lc FROM public.ladder_configs WHERE club_id = _club_id;

  SELECT r.rn INTO w_rank FROM (
    SELECT id, row_number() OVER (ORDER BY COALESCE(ranking_points,0) DESC, name) rn
    FROM public.club_members WHERE club_id = _club_id AND public.is_rankable_member(id)
  ) r WHERE r.id = _winner_member_id;
  SELECT r.rn INTO l_rank FROM (
    SELECT id, row_number() OVER (ORDER BY COALESCE(ranking_points,0) DESC, name) rn
    FROM public.club_members WHERE club_id = _club_id AND public.is_rankable_member(id)
  ) r WHERE r.id = _loser_member_id;

  SELECT COALESCE(ranking_points,0) INTO w_points FROM public.club_members WHERE id = _winner_member_id;
  SELECT COALESCE(ranking_points,0) INTO l_points FROM public.club_members WHERE id = _loser_member_id;

  IF _source_type = 'challenge' THEN
    v_mode := COALESCE(lc.ranking_sync_mode, 'formula');
  END IF;
  IF v_mode = 'none' THEN RETURN NULL; END IF;

  IF v_mode = 'mirror' THEN
    IF w_points <= l_points THEN
      w_delta := round((l_points - w_points) + COALESCE(lc.ranking_mirror_margin, 1), 2);
    ELSE
      w_delta := 0;
    END IF;
    l_delta := 0;
  ELSE
    IF w_rank IS NULL OR l_rank IS NULL THEN
      w_delta := round(COALESCE(c.points_base_win,0.25), 2);
      l_delta := round(-COALESCE(c.points_loser_deduction,0), 2);
    ELSE
      gap := l_rank - w_rank;
      IF gap < 0 THEN
        w_delta := round(COALESCE(c.points_base_win,0.25) + COALESCE(c.points_upset_bonus_per_rank,0.1) * abs(gap), 2);
        l_delta := round(-COALESCE(c.points_loser_deduction,0), 2);
      ELSE
        w_delta := round(greatest(COALESCE(c.points_base_win,0.25) - 0.02 * gap, COALESCE(c.points_favourite_win_min,0.1)), 2);
        l_delta := 0;
      END IF;
    END IF;
  END IF;

  IF w_delta = 0 AND l_delta = 0 THEN RETURN NULL; END IF;

  IF _source_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.ranking_points_pending
    WHERE club_id = _club_id AND match_source_type = _source_type AND match_source_id = _source_id
      AND winner_member_id = _winner_member_id AND loser_member_id = _loser_member_id
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.ranking_points_pending (
    club_id, match_source_type, match_source_id, winner_member_id, loser_member_id,
    winner_rank_at_match, loser_rank_at_match, winner_delta, loser_delta, status
  ) VALUES (
    _club_id, _source_type, _source_id, _winner_member_id, _loser_member_id,
    w_rank, l_rank, w_delta, l_delta,
    CASE WHEN _source_type = 'challenge' AND COALESCE(lc.ranking_auto_approve,false) THEN 'approved' ELSE 'pending' END
  ) RETURNING id INTO v_pending;

  IF _source_type = 'challenge' AND COALESCE(lc.ranking_auto_approve,false) THEN
    UPDATE public.club_members SET ranking_points = COALESCE(ranking_points,0) + w_delta
      WHERE id = _winner_member_id RETURNING ranking_points INTO v_wb;
    UPDATE public.club_members SET ranking_points = COALESCE(ranking_points,0) + l_delta
      WHERE id = _loser_member_id RETURNING ranking_points INTO v_lb;
    UPDATE public.ranking_points_pending SET reviewed_at = now() WHERE id = v_pending;
  END IF;

  RETURN v_pending;
END;
$function$;

-- Seeding: only ladder members are seeded; everyone else is cleared to 0.
CREATE OR REPLACE FUNCTION public.seed_ranking_points_from_ladder(_club_id uuid, _top_score numeric DEFAULT 1000, _step numeric DEFAULT 10, _unranked_default numeric DEFAULT 500)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  is_admin boolean;
  rows_updated integer := 0;
  r RECORD;
  new_balance numeric;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.user_id = auth.uid() AND cm.club_id = _club_id AND cm.role = 'admin'
  ) INTO is_admin;
  IF NOT is_admin THEN RAISE EXCEPTION 'Not authorized'; END IF;

  -- Non-members (visitors, league-only guests, anyone off the ladder) hold no points.
  UPDATE public.club_members SET ranking_points = 0
   WHERE club_id = _club_id AND NOT public.is_rankable_member(id)
     AND COALESCE(ranking_points,0) <> 0;

  FOR r IN
    SELECT id, ladder_position FROM public.club_members
     WHERE club_id = _club_id AND public.is_rankable_member(id)
  LOOP
    new_balance := GREATEST(0, _top_score - (r.ladder_position - 1) * _step);

    UPDATE public.club_members SET ranking_points = new_balance WHERE id = r.id;

    INSERT INTO public.ranking_points_ledger (club_id, member_id, delta, balance_after, reason, source_type, created_by)
    VALUES (_club_id, r.id, new_balance, new_balance, 'Initial seed from ladder position', 'seed', auth.uid());

    rows_updated := rows_updated + 1;
  END LOOP;

  RETURN rows_updated;
END;
$function$;

-- Snapshots follow the same eligibility rule.
CREATE OR REPLACE FUNCTION public.snapshot_club_rankings(_club_id uuid, _period date DEFAULT NULL::date)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_period date := COALESCE(_period, date_trunc('month', now())::date);
  v_snap uuid;
  v_count integer := 0;
BEGIN
  IF _club_id IS NULL THEN RETURN NULL; END IF;

  IF current_user = 'authenticated' AND NOT EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.user_id = auth.uid() AND cm.club_id = _club_id AND cm.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only club admins can snapshot rankings';
  END IF;

  INSERT INTO public.club_ranking_snapshots (club_id, period_start)
  VALUES (_club_id, v_period)
  ON CONFLICT (club_id, period_start) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_snap;

  DELETE FROM public.club_ranking_snapshot_entries WHERE snapshot_id = v_snap;

  INSERT INTO public.club_ranking_snapshot_entries
    (snapshot_id, club_id, club_member_id, rank, ranking_points, ladder_position)
  SELECT v_snap, _club_id, r.id, r.rn, r.pts, r.ladder_position
  FROM (
    SELECT cm.id,
           COALESCE(cm.ranking_points, 0) AS pts,
           cm.ladder_position,
           row_number() OVER (ORDER BY COALESCE(cm.ranking_points,0) DESC, cm.name) AS rn
    FROM public.club_members cm
    WHERE cm.club_id = _club_id
      AND public.is_rankable_member(cm.id)
  ) r;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  UPDATE public.club_ranking_snapshots SET member_count = v_count, updated_at = now() WHERE id = v_snap;

  RETURN v_snap;
END;
$function$;