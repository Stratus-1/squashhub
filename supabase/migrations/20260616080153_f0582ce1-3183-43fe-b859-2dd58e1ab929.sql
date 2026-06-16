
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- Helper function: flips any non-completed tournament whose end_date is in
-- the past to 'completed'. Returns the number of rows changed.
CREATE OR REPLACE FUNCTION public.auto_complete_past_tournaments()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  UPDATE public.club_champs
     SET status = 'completed',
         updated_at = now()
   WHERE status IS DISTINCT FROM 'completed'
     AND end_date IS NOT NULL
     AND end_date < (now() AT TIME ZONE 'Africa/Johannesburg')::date;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.auto_complete_past_tournaments() FROM PUBLIC, anon, authenticated;

-- Schedule daily at 02:15 UTC (~04:15 SAST) — well after midnight local.
DO $$
BEGIN
  PERFORM cron.unschedule('auto-complete-past-tournaments');
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

SELECT cron.schedule(
  'auto-complete-past-tournaments',
  '15 2 * * *',
  $$ SELECT public.auto_complete_past_tournaments(); $$
);

-- Backfill immediately so existing past tournaments move now.
SELECT public.auto_complete_past_tournaments();
