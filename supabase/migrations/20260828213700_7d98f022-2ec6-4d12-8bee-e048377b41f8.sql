-- 1. Extend nsa_rubber_history for multi-season + scoring data
ALTER TABLE public.nsa_rubber_history
  ADD COLUMN IF NOT EXISTS season_code text,
  ADD COLUMN IF NOT EXISTS season_year integer,
  ADD COLUMN IF NOT EXISTS opponent_code text,
  ADD COLUMN IF NOT EXISTS opponent_name text;

UPDATE public.nsa_rubber_history
SET season_code = COALESCE(season_code, 's79'),
    season_year = COALESCE(season_year, EXTRACT(YEAR FROM fixture_date)::int)
WHERE season_code IS NULL OR season_year IS NULL;

ALTER TABLE public.nsa_rubber_history
  DROP CONSTRAINT IF EXISTS nsa_rubber_history_position_check;
ALTER TABLE public.nsa_rubber_history
  ADD CONSTRAINT nsa_rubber_history_position_check CHECK (position >= 1 AND position <= 10);

CREATE INDEX IF NOT EXISTS idx_nsa_rubber_history_season
  ON public.nsa_rubber_history (season_year, player_code);

-- 2. Sync run log
CREATE TABLE public.nsa_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  association_id uuid,
  kind text NOT NULL,
  season_code text,
  season_year integer,
  status text NOT NULL DEFAULT 'running',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  seen_count integer NOT NULL DEFAULT 0,
  created_count integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  triggered_by uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.nsa_sync_runs TO authenticated;
GRANT ALL ON public.nsa_sync_runs TO service_role;
ALTER TABLE public.nsa_sync_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Federation admins read nsa sync runs" ON public.nsa_sync_runs
  FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.is_national_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_nsa_sync_runs_started ON public.nsa_sync_runs (started_at DESC);

-- 3. Review queue for unmatched people / records
CREATE TABLE public.nsa_sync_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.nsa_sync_runs(id) ON DELETE SET NULL,
  issue_type text NOT NULL,
  external_ref text,
  label text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_at timestamptz,
  resolved_by uuid,
  resolution text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.nsa_sync_issues TO authenticated;
GRANT ALL ON public.nsa_sync_issues TO service_role;
ALTER TABLE public.nsa_sync_issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Federation admins read nsa sync issues" ON public.nsa_sync_issues
  FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.is_national_admin(auth.uid()));
CREATE POLICY "Federation admins resolve nsa sync issues" ON public.nsa_sync_issues
  FOR UPDATE TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.is_national_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()) OR public.is_national_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_nsa_sync_issues_open
  ON public.nsa_sync_issues (issue_type) WHERE resolved_at IS NULL;

-- 4. Ranking settings per association
CREATE TABLE public.association_ranking_settings (
  association_id uuid PRIMARY KEY,
  win_points numeric NOT NULL DEFAULT 10,
  loss_points numeric NOT NULL DEFAULT 3,
  clean_sweep_bonus numeric NOT NULL DEFAULT 2,
  close_loss_bonus numeric NOT NULL DEFAULT 2,
  league_step numeric NOT NULL DEFAULT 0.85,
  reserve_factor numeric NOT NULL DEFAULT 0.70,
  position_top_weight numeric NOT NULL DEFAULT 1.00,
  position_step numeric NOT NULL DEFAULT 0.05,
  best_n integer NOT NULL DEFAULT 12,
  season_decay jsonb NOT NULL DEFAULT '{"0":1,"1":0.5,"2":0.25}'::jsonb,
  opponent_scale numeric NOT NULL DEFAULT 0.25,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.association_ranking_settings TO authenticated;
GRANT ALL ON public.association_ranking_settings TO service_role;
ALTER TABLE public.association_ranking_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone signed in reads ranking settings" ON public.association_ranking_settings
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Federation admins manage ranking settings" ON public.association_ranking_settings
  FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.is_national_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()) OR public.is_national_admin(auth.uid()));

-- 5. Per-rubber ranking points (explainable breakdown)
CREATE TABLE public.ranking_rubber_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  association_id uuid,
  season_year integer NOT NULL,
  player_code text NOT NULL,
  player_name text,
  person_id uuid,
  nsa_fixture_id integer,
  fixture_date date NOT NULL,
  category text,
  league_label text,
  team_code text,
  position smallint,
  won boolean,
  games_for integer,
  games_against integer,
  base_points numeric NOT NULL DEFAULT 0,
  league_weight numeric NOT NULL DEFAULT 1,
  position_weight numeric NOT NULL DEFAULT 1,
  opponent_factor numeric NOT NULL DEFAULT 1,
  points numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season_year, nsa_fixture_id, team_code, position)
);
GRANT SELECT ON public.ranking_rubber_points TO authenticated;
GRANT ALL ON public.ranking_rubber_points TO service_role;
ALTER TABLE public.ranking_rubber_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed in users read ranking rubber points" ON public.ranking_rubber_points
  FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_ranking_rubber_points_player
  ON public.ranking_rubber_points (player_code, season_year);

-- 6. Ranking snapshots
CREATE TABLE public.ranking_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  association_id uuid,
  computed_at timestamptz NOT NULL DEFAULT now(),
  basis_seasons integer[] NOT NULL DEFAULT '{}',
  player_count integer NOT NULL DEFAULT 0,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ranking_snapshots TO authenticated;
GRANT ALL ON public.ranking_snapshots TO service_role;
ALTER TABLE public.ranking_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed in users read ranking snapshots" ON public.ranking_snapshots
  FOR SELECT TO authenticated USING (true);

CREATE TABLE public.ranking_snapshot_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid NOT NULL REFERENCES public.ranking_snapshots(id) ON DELETE CASCADE,
  association_id uuid,
  player_code text NOT NULL,
  player_name text,
  person_id uuid,
  club_label text,
  category text,
  rank integer NOT NULL,
  previous_rank integer,
  score numeric NOT NULL DEFAULT 0,
  rubbers_counted integer NOT NULL DEFAULT 0,
  season_breakdown jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (snapshot_id, player_code, category)
);
GRANT SELECT ON public.ranking_snapshot_entries TO authenticated;
GRANT ALL ON public.ranking_snapshot_entries TO service_role;
ALTER TABLE public.ranking_snapshot_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Signed in users read ranking entries" ON public.ranking_snapshot_entries
  FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_ranking_entries_snapshot
  ON public.ranking_snapshot_entries (snapshot_id, rank);

-- 7. updated_at triggers
CREATE TRIGGER trg_nsa_sync_runs_updated BEFORE UPDATE ON public.nsa_sync_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_nsa_sync_issues_updated BEFORE UPDATE ON public.nsa_sync_issues
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_assoc_ranking_settings_updated BEFORE UPDATE ON public.association_ranking_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();