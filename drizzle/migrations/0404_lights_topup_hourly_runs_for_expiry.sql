-- The hourly Lights top-up job only fired while a top-up was waiting for GoBook, so
-- unpaid card top-ups older than 24 hours were never expired. Also fire for those.
SELECT cron.alter_job(
  job_id := (SELECT jobid FROM cron.job WHERE jobname = 'gobook-lights-topups-hourly'),
  command := $cmd$
  SELECT net.http_post(
    url := 'https://bzbuppwzljadulwntjys.supabase.co/functions/v1/gobook-lights-topup',
    headers := jsonb_build_object('Content-Type','application/json'),
    body := jsonb_build_object('action','process'))
  WHERE EXISTS (SELECT 1 FROM public.gobook_lights_topups
                 WHERE status IN ('ready','submitting','submitted')
                    OR (method = 'card' AND status = 'awaiting_payment' AND created_at < now() - interval '24 hours'));
$cmd$);