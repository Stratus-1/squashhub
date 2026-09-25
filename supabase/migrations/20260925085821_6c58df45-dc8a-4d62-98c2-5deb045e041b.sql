CREATE TABLE public.ai_bug_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL,
  club_id uuid REFERENCES public.clubs(id) ON DELETE SET NULL,
  reporter_user_id uuid,
  reporter_role text,
  title text NOT NULL,
  feature text NOT NULL,
  screen text,
  expected_behaviour text NOT NULL,
  actual_behaviour text NOT NULL,
  evidence text NOT NULL,
  related_ids jsonb NOT NULL DEFAULT '{}'::jsonb,
  reproduction text,
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('low','medium','high','critical')),
  verification text NOT NULL DEFAULT 'suspected' CHECK (verification IN ('suspected','verified')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','fixed','wont_fix','duplicate')),
  occurrences integer NOT NULL DEFAULT 1,
  occurrence_log jsonb NOT NULL DEFAULT '[]'::jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ai_bug_reports_open_fp ON public.ai_bug_reports (fingerprint) WHERE status IN ('open','investigating');
GRANT SELECT, UPDATE ON public.ai_bug_reports TO authenticated;
GRANT ALL ON public.ai_bug_reports TO service_role;
ALTER TABLE public.ai_bug_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins read bug reports" ON public.ai_bug_reports FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));
CREATE POLICY "Super admins update bug reports" ON public.ai_bug_reports FOR UPDATE TO authenticated USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));
ALTER TABLE public.ai_assist_interactions ADD COLUMN IF NOT EXISTS bug_report_id uuid REFERENCES public.ai_bug_reports(id) ON DELETE SET NULL;