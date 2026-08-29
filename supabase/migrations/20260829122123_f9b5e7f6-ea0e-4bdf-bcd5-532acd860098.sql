-- 1. Monthly club ranking snapshots
CREATE TABLE IF NOT EXISTS public.club_ranking_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  member_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (club_id, period_start)
);

GRANT SELECT ON public.club_ranking_snapshots TO authenticated;
GRANT ALL ON public.club_ranking_snapshots TO service_role;
ALTER TABLE public.club_ranking_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Club members can view ranking snapshots" ON public.club_ranking_snapshots;
CREATE POLICY "Club members can view ranking snapshots"
ON public.club_ranking_snapshots FOR SELECT TO authenticated
USING (public.is_club_member(auth.uid(), club_id));

CREATE TABLE IF NOT EXISTS public.club_ranking_snapshot_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid NOT NULL REFERENCES public.club_ranking_snapshots(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  club_member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  rank integer NOT NULL,
  ranking_points numeric NOT NULL DEFAULT 0,
  ladder_position integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (snapshot_id, club_member_id)
);

CREATE INDEX IF NOT EXISTS idx_club_rank_snap_entries_member
  ON public.club_ranking_snapshot_entries (club_member_id, created_at DESC);

GRANT SELECT ON public.club_ranking_snapshot_entries TO authenticated;
GRANT ALL ON public.club_ranking_snapshot_entries TO service_role;
ALTER TABLE public.club_ranking_snapshot_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Club members can view ranking snapshot entries" ON public.club_ranking_snapshot_entries;
CREATE POLICY "Club members can view ranking snapshot entries"
ON public.club_ranking_snapshot_entries FOR SELECT TO authenticated
USING (public.is_club_member(auth.uid(), club_id));

CREATE OR REPLACE FUNCTION public.club_ranking_snapshots_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_club_ranking_snapshots_touch ON public.club_ranking_snapshots;
CREATE TRIGGER trg_club_ranking_snapshots_touch
BEFORE UPDATE ON public.club_ranking_snapshots
FOR EACH ROW EXECUTE FUNCTION public.club_ranking_snapshots_touch();

-- 2. Snapshot routine (idempotent per club + month)
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

CREATE OR REPLACE FUNCTION public.snapshot_all_club_rankings()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE r RECORD; n integer := 0;
BEGIN
  FOR r IN SELECT id FROM public.clubs WHERE COALESCE(ranking_points_enabled,false) IS TRUE LOOP
    PERFORM public.snapshot_club_rankings(r.id, NULL);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.snapshot_all_club_rankings() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.snapshot_all_club_rankings() TO service_role;

-- Monthly job: 1st of each month, 00:20 UTC
DO $$ BEGIN
  PERFORM cron.unschedule('monthly-club-ranking-snapshot');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'monthly-club-ranking-snapshot',
  '20 0 1 * *',
  $$SELECT public.snapshot_all_club_rankings();$$
);

-- 3. Championship / tournament results feed the ranking engine
CREATE OR REPLACE FUNCTION public.award_points_for_champ_match()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_club_id uuid;
  v_loser uuid;
BEGIN
  IF NEW.winner_member_id IS NULL OR COALESCE(NEW.is_bye,false) IS TRUE THEN RETURN NEW; END IF;
  IF lower(COALESCE(NEW.status,'')) NOT IN ('completed','confirmed','finished') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE'
     AND OLD.winner_member_id IS NOT DISTINCT FROM NEW.winner_member_id
     AND lower(COALESCE(OLD.status,'')) IN ('completed','confirmed','finished') THEN
    RETURN NEW;
  END IF;

  IF NEW.player_a_member_id IS NULL OR NEW.player_b_member_id IS NULL THEN RETURN NEW; END IF;

  v_loser := CASE WHEN NEW.winner_member_id = NEW.player_a_member_id
                  THEN NEW.player_b_member_id ELSE NEW.player_a_member_id END;

  SELECT t.club_id INTO v_club_id FROM public.tournaments t WHERE t.id = NEW.champ_id;
  IF v_club_id IS NULL THEN RETURN NEW; END IF;

  PERFORM public.award_ranking_points_for_result(
    v_club_id, NEW.winner_member_id, v_loser, 'tournament', NEW.id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_award_points_for_champ_match ON public.club_champs_matches;
CREATE TRIGGER trg_award_points_for_champ_match
AFTER INSERT OR UPDATE ON public.club_champs_matches
FOR EACH ROW EXECUTE FUNCTION public.award_points_for_champ_match();

-- 4. League rubbers feed the ranking engine (same-club rubbers only)
CREATE OR REPLACE FUNCTION public.award_points_for_league_rubber()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_winner uuid; v_loser uuid;
  v_wc uuid; v_lc uuid;
BEGIN
  IF NEW.winner IS NULL OR NEW.winner NOT IN ('home','away') THEN RETURN NEW; END IF;
  IF NEW.home_player_member_id IS NULL OR NEW.away_player_member_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.winner IS NOT DISTINCT FROM NEW.winner
     AND OLD.home_player_member_id IS NOT DISTINCT FROM NEW.home_player_member_id
     AND OLD.away_player_member_id IS NOT DISTINCT FROM NEW.away_player_member_id THEN
    RETURN NEW;
  END IF;

  IF NEW.winner = 'home' THEN
    v_winner := NEW.home_player_member_id; v_loser := NEW.away_player_member_id;
  ELSE
    v_winner := NEW.away_player_member_id; v_loser := NEW.home_player_member_id;
  END IF;

  SELECT club_id INTO v_wc FROM public.club_members WHERE id = v_winner;
  SELECT club_id INTO v_lc FROM public.club_members WHERE id = v_loser;
  IF v_wc IS NULL OR v_wc IS DISTINCT FROM v_lc THEN RETURN NEW; END IF;

  PERFORM public.award_ranking_points_for_result(v_wc, v_winner, v_loser, 'league', NEW.id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_award_points_for_league_rubber ON public.league_match_results;
CREATE TRIGGER trg_award_points_for_league_rubber
AFTER INSERT OR UPDATE ON public.league_match_results
FOR EACH ROW EXECUTE FUNCTION public.award_points_for_league_rubber();