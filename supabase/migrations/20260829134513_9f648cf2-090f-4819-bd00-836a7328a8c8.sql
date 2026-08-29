-- 1. Reverse an approved ranking award (idempotent, audited)
CREATE OR REPLACE FUNCTION public.reverse_ranking_points_pending(
  _pending_id uuid,
  _reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p RECORD;
  is_admin boolean;
  wb numeric;
  lb numeric;
BEGIN
  SELECT * INTO p FROM public.ranking_points_pending WHERE id = _pending_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Award not found'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.user_id = auth.uid() AND cm.club_id = p.club_id AND cm.role = 'admin'
  ) INTO is_admin;
  IF NOT is_admin THEN RAISE EXCEPTION 'Not authorized'; END IF;

  IF p.status <> 'approved' THEN
    RAISE EXCEPTION 'Only approved awards can be reversed (status: %)', p.status;
  END IF;

  -- Idempotency: never reverse the same award twice
  IF EXISTS (
    SELECT 1 FROM public.ranking_points_ledger
    WHERE pending_id = p.id AND source_type = 'reversal'
  ) THEN
    RETURN;
  END IF;

  UPDATE public.club_members
     SET ranking_points = COALESCE(ranking_points,0) - COALESCE(p.winner_delta,0)
   WHERE id = p.winner_member_id RETURNING ranking_points INTO wb;

  UPDATE public.club_members
     SET ranking_points = COALESCE(ranking_points,0) - COALESCE(p.loser_delta,0)
   WHERE id = p.loser_member_id RETURNING ranking_points INTO lb;

  INSERT INTO public.ranking_points_ledger (club_id, member_id, delta, balance_after, reason, source_type, source_id, pending_id, created_by)
  VALUES
    (p.club_id, p.winner_member_id, -COALESCE(p.winner_delta,0), COALESCE(wb,0),
     COALESCE(_reason, 'Award reversed by admin'), 'reversal', p.match_source_id, p.id, auth.uid()),
    (p.club_id, p.loser_member_id, -COALESCE(p.loser_delta,0), COALESCE(lb,0),
     COALESCE(_reason, 'Award reversed by admin'), 'reversal', p.match_source_id, p.id, auth.uid());

  UPDATE public.ranking_points_pending
     SET status = 'reversed',
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         review_note = COALESCE(_reason, review_note)
   WHERE id = p.id;
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_ranking_points_pending(uuid,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.reverse_ranking_points_pending(uuid,text) TO authenticated, service_role;

-- 2. Manual admin adjustment with mandatory reason
CREATE OR REPLACE FUNCTION public.admin_adjust_ranking_points(
  _member_id uuid,
  _delta numeric,
  _reason text
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  m RECORD;
  is_admin boolean;
  nb numeric;
BEGIN
  SELECT id, club_id INTO m FROM public.club_members WHERE id = _member_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member not found'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.user_id = auth.uid() AND cm.club_id = m.club_id AND cm.role = 'admin'
  ) INTO is_admin;
  IF NOT is_admin THEN RAISE EXCEPTION 'Not authorized'; END IF;

  IF _reason IS NULL OR length(btrim(_reason)) < 3 THEN
    RAISE EXCEPTION 'A reason is required for manual adjustments';
  END IF;
  IF COALESCE(_delta,0) = 0 THEN RAISE EXCEPTION 'Adjustment cannot be zero'; END IF;

  UPDATE public.club_members
     SET ranking_points = GREATEST(0, COALESCE(ranking_points,0) + _delta)
   WHERE id = _member_id RETURNING ranking_points INTO nb;

  INSERT INTO public.ranking_points_ledger (club_id, member_id, delta, balance_after, reason, source_type, created_by)
  VALUES (m.club_id, _member_id, _delta, nb, btrim(_reason), 'manual', auth.uid());

  RETURN nb;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_adjust_ranking_points(uuid,numeric,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_adjust_ranking_points(uuid,numeric,text) TO authenticated, service_role;

-- 3. Drift check + repair: rebuild balances from the ledger
CREATE OR REPLACE FUNCTION public.recalc_club_ranking_points(
  _club_id uuid,
  _apply boolean DEFAULT false
)
RETURNS TABLE (member_id uuid, member_name text, stored numeric, computed numeric, drift numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_admin boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.user_id = auth.uid() AND cm.club_id = _club_id AND cm.role = 'admin'
  ) INTO is_admin;
  IF NOT is_admin THEN RAISE EXCEPTION 'Not authorized'; END IF;

  CREATE TEMP TABLE _recalc ON COMMIT DROP AS
  SELECT cm.id AS mid,
         cm.name AS mname,
         COALESCE(cm.ranking_points,0)::numeric AS stored_pts,
         GREATEST(0, COALESCE((
           SELECT SUM(l.delta) FROM public.ranking_points_ledger l
           WHERE l.member_id = cm.id AND l.club_id = _club_id
         ),0))::numeric AS computed_pts
  FROM public.club_members cm
  WHERE cm.club_id = _club_id;

  IF _apply THEN
    UPDATE public.club_members cm
       SET ranking_points = r.computed_pts
      FROM _recalc r
     WHERE cm.id = r.mid AND COALESCE(cm.ranking_points,0) <> r.computed_pts;
  END IF;

  RETURN QUERY
  SELECT r.mid, r.mname, r.stored_pts, r.computed_pts, (r.computed_pts - r.stored_pts)
    FROM _recalc r
   WHERE r.stored_pts <> r.computed_pts
   ORDER BY abs(r.computed_pts - r.stored_pts) DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.recalc_club_ranking_points(uuid,boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.recalc_club_ranking_points(uuid,boolean) TO authenticated, service_role;