-- 1. Allow internal (cron/maintenance) roles to compute stats without a logged-in user
CREATE OR REPLACE FUNCTION public.can_view_member_stats(_member_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_club uuid;
BEGIN
  -- internal maintenance context (pg_cron / service_role): no end user involved
  IF auth.uid() IS NULL AND current_user IN ('postgres', 'supabase_admin', 'service_role') THEN
    RETURN true;
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT club_id INTO v_club FROM public.club_members WHERE id = _member_id;
  IF v_club IS NULL THEN
    RETURN false;
  END IF;

  -- own record, a linked member record, or a club-mate
  RETURN EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.user_id = auth.uid()
      AND cm.club_id = v_club
  );
END;
$$;

-- 2. Stored (cached) stats
CREATE TABLE IF NOT EXISTS public.member_stats_cache (
  member_id uuid NOT NULL,
  season_year integer NOT NULL, -- 0 = all time
  category text NOT NULL,
  played integer NOT NULL DEFAULT 0,
  won integer NOT NULL DEFAULT 0,
  lost integer NOT NULL DEFAULT 0,
  computed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (member_id, season_year, category)
);

GRANT SELECT ON public.member_stats_cache TO authenticated;
GRANT ALL ON public.member_stats_cache TO service_role;
ALTER TABLE public.member_stats_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read stats they may view"
ON public.member_stats_cache FOR SELECT TO authenticated
USING (public.can_view_member_stats(member_id));

-- 3. Recompute one member's stored stats from the live sources
CREATE OR REPLACE FUNCTION public.refresh_member_stats_cache(_member_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_now timestamptz := now();
BEGIN
  DELETE FROM public.member_stats_cache WHERE member_id = _member_id;

  INSERT INTO public.member_stats_cache (member_id, season_year, category, played, won, lost, computed_at, updated_at)
  WITH h AS (
    SELECT COALESCE(x.season_year, 0) AS season_year,
           x.category,
           COALESCE(x.won, false) AS won
    FROM public.get_member_match_history(_member_id, NULL, NULL, NULL) x
  ),
  agg AS (
    SELECT season_year, category, count(*) AS played, count(*) FILTER (WHERE won) AS won
    FROM h GROUP BY 1, 2
    UNION ALL
    SELECT season_year, 'total', count(*), count(*) FILTER (WHERE won) FROM h GROUP BY 1
    UNION ALL
    SELECT 0, category, count(*), count(*) FILTER (WHERE won) FROM h GROUP BY 2
    UNION ALL
    SELECT 0, 'total', count(*), count(*) FILTER (WHERE won) FROM h
  )
  SELECT _member_id, season_year, category,
         sum(played)::int, sum(won)::int, (sum(played) - sum(won))::int,
         v_now, v_now
  FROM agg
  GROUP BY season_year, category;

  -- always keep a marker row so we know when the member was last computed
  INSERT INTO public.member_stats_cache (member_id, season_year, category, played, won, lost, computed_at, updated_at)
  VALUES (_member_id, 0, 'total', 0, 0, 0, v_now, v_now)
  ON CONFLICT (member_id, season_year, category) DO NOTHING;

  RETURN v_now;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_member_stats_cache(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.refresh_member_stats_cache(uuid) TO authenticated, service_role;

-- 4. Read stored stats, refreshing only when missing or older than a week
CREATE OR REPLACE FUNCTION public.get_member_stats_cached(_member_id uuid, _season_year integer DEFAULT NULL)
RETURNS TABLE(category text, played bigint, won bigint, lost bigint, computed_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_computed timestamptz;
BEGIN
  IF NOT public.can_view_member_stats(_member_id) THEN
    RETURN;
  END IF;

  SELECT max(c.computed_at) INTO v_computed
  FROM public.member_stats_cache c WHERE c.member_id = _member_id;

  IF v_computed IS NULL OR v_computed < now() - interval '7 days' THEN
    v_computed := public.refresh_member_stats_cache(_member_id);
  END IF;

  RETURN QUERY
  SELECT c.category, c.played::bigint, c.won::bigint, c.lost::bigint, c.computed_at
  FROM public.member_stats_cache c
  WHERE c.member_id = _member_id
    AND c.season_year = COALESCE(_season_year, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.get_member_stats_cached(uuid, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.get_member_stats_cached(uuid, integer) TO authenticated, service_role;

-- 5. Seasons list from the stored stats
CREATE OR REPLACE FUNCTION public.get_member_stat_seasons_cached(_member_id uuid)
RETURNS TABLE(season_year integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.can_view_member_stats(_member_id) THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.member_stats_cache c WHERE c.member_id = _member_id AND c.computed_at IS NOT NULL) THEN
    PERFORM public.refresh_member_stats_cache(_member_id);
  END IF;

  RETURN QUERY
  SELECT DISTINCT c.season_year
  FROM public.member_stats_cache c
  WHERE c.member_id = _member_id AND c.season_year > 0
  ORDER BY 1 DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_member_stat_seasons_cached(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_member_stat_seasons_cached(uuid) TO authenticated, service_role;

-- 6. Mark stats stale when a club / championship result lands
CREATE OR REPLACE FUNCTION public.mark_member_stats_stale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.member_stats_cache
  SET computed_at = NULL, updated_at = now()
  WHERE member_id IN (
    NEW.player_a_member_id, NEW.player_b_member_id, NEW.winner_member_id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_matches_stats_stale ON public.matches;
CREATE TRIGGER trg_matches_stats_stale
AFTER INSERT OR UPDATE ON public.matches
FOR EACH ROW EXECUTE FUNCTION public.mark_member_stats_stale();

DROP TRIGGER IF EXISTS trg_champ_matches_stats_stale ON public.club_champs_matches;
CREATE TRIGGER trg_champ_matches_stats_stale
AFTER INSERT OR UPDATE ON public.club_champs_matches
FOR EACH ROW EXECUTE FUNCTION public.mark_member_stats_stale();

-- 7. Weekly refresh of stale stored stats
CREATE OR REPLACE FUNCTION public.refresh_stale_member_stats(_limit integer DEFAULT 2000)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE r record; n integer := 0;
BEGIN
  FOR r IN
    SELECT member_id
    FROM public.member_stats_cache
    GROUP BY member_id
    HAVING max(computed_at) IS NULL OR max(computed_at) < now() - interval '6 days'
    LIMIT _limit
  LOOP
    PERFORM public.refresh_member_stats_cache(r.member_id);
    n := n + 1;
  END LOOP;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_stale_member_stats(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.refresh_stale_member_stats(integer) TO service_role;

SELECT cron.unschedule('refresh-member-stats-weekly')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-member-stats-weekly');

SELECT cron.schedule(
  'refresh-member-stats-weekly',
  '0 3 * * 0',
  $$SELECT public.refresh_stale_member_stats(5000);$$
);