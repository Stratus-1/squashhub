-- 1. Ladder config: ranking sync options
ALTER TABLE public.ladder_configs
  ADD COLUMN IF NOT EXISTS ranking_sync_mode text NOT NULL DEFAULT 'formula',
  ADD COLUMN IF NOT EXISTS ranking_mirror_margin numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS ranking_auto_approve boolean NOT NULL DEFAULT false;

DO $$ BEGIN
  ALTER TABLE public.ladder_configs
    ADD CONSTRAINT ladder_configs_ranking_sync_mode_chk
    CHECK (ranking_sync_mode IN ('none','formula','mirror'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Which competitions feed club ranking points
ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS points_from_challenges boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS points_from_leagues boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS points_from_tournaments boolean NOT NULL DEFAULT true;

-- 3. Versioned ranking rules
CREATE TABLE IF NOT EXISTS public.club_ranking_rule_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  version integer NOT NULL,
  settings jsonb NOT NULL,
  note text,
  effective_from timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (club_id, version)
);

GRANT SELECT, INSERT ON public.club_ranking_rule_versions TO authenticated;
GRANT ALL ON public.club_ranking_rule_versions TO service_role;

ALTER TABLE public.club_ranking_rule_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Club members can view ranking rule versions" ON public.club_ranking_rule_versions;
CREATE POLICY "Club members can view ranking rule versions"
ON public.club_ranking_rule_versions FOR SELECT TO authenticated
USING (public.is_club_member(auth.uid(), club_id));

DROP POLICY IF EXISTS "Club admins can add ranking rule versions" ON public.club_ranking_rule_versions;
CREATE POLICY "Club admins can add ranking rule versions"
ON public.club_ranking_rule_versions FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.club_members cm
  WHERE cm.user_id = auth.uid() AND cm.club_id = club_ranking_rule_versions.club_id
    AND cm.role = 'admin'
));

-- 4. Snapshot the formula whenever a club changes it
CREATE OR REPLACE FUNCTION public.snapshot_club_ranking_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_next integer;
BEGIN
  IF TG_OP = 'UPDATE' AND (
      COALESCE(NEW.ranking_points_enabled,false) IS DISTINCT FROM COALESCE(OLD.ranking_points_enabled,false)
      OR NEW.points_base_win IS DISTINCT FROM OLD.points_base_win
      OR NEW.points_upset_bonus_per_rank IS DISTINCT FROM OLD.points_upset_bonus_per_rank
      OR NEW.points_favourite_win_min IS DISTINCT FROM OLD.points_favourite_win_min
      OR NEW.points_loser_deduction IS DISTINCT FROM OLD.points_loser_deduction
      OR NEW.points_from_challenges IS DISTINCT FROM OLD.points_from_challenges
      OR NEW.points_from_leagues IS DISTINCT FROM OLD.points_from_leagues
      OR NEW.points_from_tournaments IS DISTINCT FROM OLD.points_from_tournaments
  ) THEN
    SELECT COALESCE(MAX(version),0) + 1 INTO v_next
      FROM public.club_ranking_rule_versions WHERE club_id = NEW.id;
    INSERT INTO public.club_ranking_rule_versions (club_id, version, settings, created_by)
    VALUES (NEW.id, v_next, jsonb_build_object(
      'ranking_points_enabled', COALESCE(NEW.ranking_points_enabled,false),
      'base_win', NEW.points_base_win,
      'upset_bonus_per_rank', NEW.points_upset_bonus_per_rank,
      'favourite_win_min', NEW.points_favourite_win_min,
      'loser_deduction', NEW.points_loser_deduction,
      'from_challenges', NEW.points_from_challenges,
      'from_leagues', NEW.points_from_leagues,
      'from_tournaments', NEW.points_from_tournaments
    ), auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_snapshot_club_ranking_rules ON public.clubs;
CREATE TRIGGER trg_snapshot_club_ranking_rules
AFTER UPDATE ON public.clubs
FOR EACH ROW EXECUTE FUNCTION public.snapshot_club_ranking_rules();

-- 5. Central award routine
CREATE OR REPLACE FUNCTION public.award_ranking_points_for_result(
  _club_id uuid,
  _winner_member_id uuid,
  _loser_member_id uuid,
  _source_type text,
  _source_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  SELECT ranking_points_enabled, points_base_win, points_upset_bonus_per_rank,
         points_favourite_win_min, points_loser_deduction,
         points_from_challenges, points_from_leagues, points_from_tournaments
    INTO c FROM public.clubs WHERE id = _club_id;
  IF NOT FOUND OR COALESCE(c.ranking_points_enabled,false) IS NOT TRUE THEN RETURN NULL; END IF;

  IF _source_type = 'challenge' AND c.points_from_challenges IS NOT TRUE THEN RETURN NULL; END IF;
  IF _source_type = 'league' AND c.points_from_leagues IS NOT TRUE THEN RETURN NULL; END IF;
  IF _source_type = 'tournament' AND c.points_from_tournaments IS NOT TRUE THEN RETURN NULL; END IF;

  SELECT * INTO lc FROM public.ladder_configs WHERE club_id = _club_id;

  -- Ranks on the POINTS leaderboard at match time
  SELECT r.rn INTO w_rank FROM (
    SELECT id, row_number() OVER (ORDER BY COALESCE(ranking_points,0) DESC, name) rn
    FROM public.club_members WHERE club_id = _club_id
  ) r WHERE r.id = _winner_member_id;
  SELECT r.rn INTO l_rank FROM (
    SELECT id, row_number() OVER (ORDER BY COALESCE(ranking_points,0) DESC, name) rn
    FROM public.club_members WHERE club_id = _club_id
  ) r WHERE r.id = _loser_member_id;

  SELECT COALESCE(ranking_points,0) INTO w_points FROM public.club_members WHERE id = _winner_member_id;
  SELECT COALESCE(ranking_points,0) INTO l_points FROM public.club_members WHERE id = _loser_member_id;

  IF _source_type = 'challenge' THEN
    v_mode := COALESCE(lc.ranking_sync_mode, 'formula');
  END IF;
  IF v_mode = 'none' THEN RETURN NULL; END IF;

  IF v_mode = 'mirror' THEN
    -- Points follow the ladder: winner lands just above the beaten player.
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

  -- Idempotency: never count the same source result twice
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
    INSERT INTO public.ranking_points_ledger (club_id, member_id, delta, balance_after, reason, source_type, source_id, pending_id)
    VALUES
      (_club_id, _winner_member_id, w_delta, v_wb, 'Win (' || _source_type || ')', _source_type, _source_id, v_pending),
      (_club_id, _loser_member_id, l_delta, v_lb, 'Loss (' || _source_type || ')', _source_type, _source_id, v_pending);
    UPDATE public.ranking_points_pending SET reviewed_at = now() WHERE id = v_pending;
  END IF;

  RETURN v_pending;
END;
$$;

REVOKE ALL ON FUNCTION public.award_ranking_points_for_result(uuid,uuid,uuid,text,uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.award_ranking_points_for_result(uuid,uuid,uuid,text,uuid) TO authenticated, service_role;