TRUNCATE TABLE cron.job_run_details;

SELECT cron.schedule(
  'cleanup-cron-history',
  '0 3 * * *',
  $$DELETE FROM cron.job_run_details WHERE end_time < now() - interval '7 days'$$
);