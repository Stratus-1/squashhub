DO $$
BEGIN
  PERFORM cron.unschedule('run-scheduled-comms-5m');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'run-scheduled-comms-5m',
  '*/5 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://bzbuppwzljadulwntjys.supabase.co/functions/v1/run-scheduled-comms',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('cron', true)
  );
  $cron$
);
