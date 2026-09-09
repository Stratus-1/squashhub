CREATE TABLE IF NOT EXISTS public.reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL,
  ref_table text,
  ref_id text,
  scheduled_for date NOT NULL DEFAULT (now() AT TIME ZONE 'Africa/Johannesburg')::date,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS reminder_log_unique_send
  ON public.reminder_log (user_id, kind, coalesce(ref_id, ''), scheduled_for);

CREATE INDEX IF NOT EXISTS reminder_log_ref_idx ON public.reminder_log (ref_table, ref_id);

GRANT ALL ON public.reminder_log TO service_role;

ALTER TABLE public.reminder_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own reminder log" ON public.reminder_log;
CREATE POLICY "Users can view own reminder log"
  ON public.reminder_log FOR SELECT TO authenticated
  USING (user_id = auth.uid());