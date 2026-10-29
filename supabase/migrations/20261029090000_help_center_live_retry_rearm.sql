-- Re-arm the delivery retry backstop after an empty queue has disarmed it.
-- Only live-mode, unheld work reactivates an existing job; paused mode and held
-- rows remain fail-closed. Pilot-mode paused-job behavior remains unchanged.
CREATE OR REPLACE FUNCTION public.help_center_outbox_wake()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $function$
DECLARE
  v_mode text := public.help_center_delivery_mode();
  v_job bigint;
BEGIN
  IF v_mode = 'paused' THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := 'https://bzbuppwzljadulwntjys.supabase.co/functions/v1/help-center-ticket-feed',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-dispatch-secret', (SELECT value FROM public.help_center_feed_private WHERE key = 'dispatch_secret')),
    body := '{}'::jsonb);

  IF v_mode = 'live' AND EXISTS (
    SELECT 1 FROM public.help_center_ticket_outbox x
    WHERE x.delivered_at IS NULL AND x.dead_at IS NULL AND x.held_at IS NULL
  ) THEN
    SELECT jobid INTO v_job
    FROM cron.job
    WHERE jobname = 'help-center-ticket-feed-retry'
    LIMIT 1;

    IF v_job IS NULL THEN
      PERFORM cron.schedule('help-center-ticket-feed-retry', '*/5 * * * *',
        'SELECT public.help_center_outbox_wake()');
    ELSE
      PERFORM cron.alter_job(job_id := v_job, active := true);
    END IF;
  ELSIF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'help-center-ticket-feed-retry'
  ) THEN
    PERFORM cron.schedule('help-center-ticket-feed-retry', '*/5 * * * *',
      'SELECT public.help_center_outbox_wake()');
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL; -- never block ticket writes; row stays queued
END
$function$;

REVOKE ALL ON FUNCTION public.help_center_outbox_wake() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.help_center_outbox_wake() TO service_role;
