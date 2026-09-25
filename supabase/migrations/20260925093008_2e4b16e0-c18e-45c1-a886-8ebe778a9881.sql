ALTER TABLE public.ai_bug_reports DROP CONSTRAINT IF EXISTS ai_bug_reports_status_check;
ALTER TABLE public.ai_bug_reports ADD CONSTRAINT ai_bug_reports_status_check CHECK (status IN ('open','investigating','fix_in_development','fix_ready','published','fixed','closed','wont_fix','duplicate'));
DROP INDEX IF EXISTS public.ai_bug_reports_open_fp;
CREATE UNIQUE INDEX ai_bug_reports_open_fp ON public.ai_bug_reports (fingerprint) WHERE status IN ('open','investigating','fix_in_development','fix_ready','published');
ALTER TABLE public.ai_bug_reports ADD COLUMN IF NOT EXISTS reopened_count integer NOT NULL DEFAULT 0;