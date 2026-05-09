
-- Re-schedule notify-league-week-kickoff cron with internal secret header
DO $$
BEGIN
  PERFORM cron.unschedule('notify-league-week-kickoff');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'notify-league-week-kickoff',
  '0 16 * * 2',
  $cron$
  DO $do$
  DECLARE
    internal_secret text;
  BEGIN
    SELECT value INTO internal_secret
      FROM public.app_settings
      WHERE key = 'push_private_internal_secret';
    IF internal_secret IS NULL THEN
      RAISE NOTICE 'push_private_internal_secret not set; skipping notify-league-week-kickoff';
      RETURN;
    END IF;
    PERFORM net.http_post(
      url := 'https://bzbuppwzljadulwntjys.supabase.co/functions/v1/notify-league-week-kickoff',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-secret', internal_secret
      ),
      body := jsonb_build_object('triggered_at', now())
    );
  END
  $do$;
  $cron$
);
