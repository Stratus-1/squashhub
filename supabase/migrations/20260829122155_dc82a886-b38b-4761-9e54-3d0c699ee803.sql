CREATE OR REPLACE FUNCTION public.snapshot_club_rankings(_club_id uuid, _period date DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period date := COALESCE(_period, date_trunc('month', now())::date);
  v_snap uuid;
  v_count integer := 0;
BEGIN
  IF _club_id IS NULL THEN RETURN NULL; END IF;

  -- Direct callers must be an admin of that club; server-side routines bypass.
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
      AND COALESCE(cm.role::text, 'member') <> 'visitor'
  ) r;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  UPDATE public.club_ranking_snapshots SET member_count = v_count, updated_at = now() WHERE id = v_snap;

  RETURN v_snap;
END;
$$;

REVOKE ALL ON FUNCTION public.snapshot_club_rankings(uuid, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.snapshot_club_rankings(uuid, date) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.award_points_for_champ_match() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.award_points_for_league_rubber() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.club_ranking_snapshots_touch() FROM public, anon, authenticated;