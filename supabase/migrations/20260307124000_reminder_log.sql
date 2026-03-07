-- Reminder delivery scaffolding (for scheduled edge function runs)
-- Keeps reminders idempotent so users don't get spammed by repeated cron runs.

CREATE TABLE IF NOT EXISTS public.reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  ref_table text NOT NULL,
  ref_id uuid,
  scheduled_for date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, kind, ref_table, ref_id, scheduled_for)
);

ALTER TABLE public.reminder_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'reminder_log' AND policyname = 'Admins can view reminder log'
  ) THEN
    CREATE POLICY "Admins can view reminder log"
      ON public.reminder_log FOR SELECT TO authenticated
      USING (public.is_admin_or_moderator(auth.uid()));
  END IF;
END $$;

