-- Dynamic court reflow settings + audit log
ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS dynamic_court_reflow_enabled boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.court_reflow_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid,
  source_kind text NOT NULL, -- 'league_fixture' | 'tournament_match'
  source_id uuid NOT NULL,
  moved_kind text NOT NULL,
  moved_id uuid NOT NULL,
  from_court_id integer,
  to_court_id integer,
  from_start_time text,
  to_start_time text,
  fixture_date date,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.court_reflow_log TO authenticated;
GRANT ALL ON public.court_reflow_log TO service_role;

ALTER TABLE public.court_reflow_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Club members can read reflow log for their club"
ON public.court_reflow_log
FOR SELECT
TO authenticated
USING (
  club_id IS NULL OR EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.club_id = court_reflow_log.club_id
      AND cm.user_id = auth.uid()
  )
);

CREATE INDEX IF NOT EXISTS court_reflow_log_club_created_idx
  ON public.court_reflow_log (club_id, created_at DESC);
CREATE INDEX IF NOT EXISTS court_reflow_log_source_idx
  ON public.court_reflow_log (source_kind, source_id);