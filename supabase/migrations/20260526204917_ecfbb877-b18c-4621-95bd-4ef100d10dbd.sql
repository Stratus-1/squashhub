
-- 1. In-progress game storage (does not count toward "matchDecided")
ALTER TABLE public.league_match_results
  ADD COLUMN IF NOT EXISTS current_game jsonb;

-- 2. Soft marker locks
CREATE TABLE IF NOT EXISTS public.league_marker_locks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id uuid NOT NULL,
  position integer NOT NULL,
  user_id uuid NOT NULL,
  user_name text NOT NULL,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  heartbeat_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fixture_id, position)
);

CREATE INDEX IF NOT EXISTS idx_league_marker_locks_fixture
  ON public.league_marker_locks (fixture_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.league_marker_locks TO authenticated;
GRANT ALL ON public.league_marker_locks TO service_role;

ALTER TABLE public.league_marker_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read marker locks"
  ON public.league_marker_locks FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Users insert own marker lock"
  ON public.league_marker_locks FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own marker lock or stale"
  ON public.league_marker_locks FOR UPDATE
  TO authenticated USING (
    auth.uid() = user_id
    OR heartbeat_at < now() - interval '60 seconds'
  );

CREATE POLICY "Users delete own marker lock or stale"
  ON public.league_marker_locks FOR DELETE
  TO authenticated USING (
    auth.uid() = user_id
    OR heartbeat_at < now() - interval '60 seconds'
  );

-- 3. Realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.league_marker_locks;
