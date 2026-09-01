select cron.unschedule('stitch-sweep-pending-payments-10m') where exists (select 1 from cron.job where jobname = 'stitch-sweep-pending-payments-10m');

select cron.schedule(
  'stitch-sweep-pending-payments-10m',
  '*/10 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://bzbuppwzljadulwntjys.supabase.co/functions/v1/stitch-sweep-pending-payments',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6YnVwcHd6bGphZHVsd250anlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzMDg1MzIsImV4cCI6MjA4ODg4NDUzMn0.R4_HmBBoAna8ahkVBRGVoXR8UDMfa1ryglYn9poaHSc"}'::jsonb,
    body := jsonb_build_object('scheduled_at', now())
  );
  $$
);