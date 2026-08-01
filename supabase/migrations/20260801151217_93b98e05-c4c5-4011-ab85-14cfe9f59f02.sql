DO $$
BEGIN
  PERFORM cron.unschedule('stitch-reconcile-mandates-2h');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('stitch-reconcile-mandates-15m');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'stitch-reconcile-mandates-15m',
  '*/15 * * * *',
  $cron$
  DO $do$
  DECLARE
    internal_secret text;
  BEGIN
    SELECT value INTO internal_secret FROM public.app_settings WHERE key = 'stitch_private_internal_secret';
    IF internal_secret IS NULL THEN
      RAISE NOTICE 'stitch_private_internal_secret not set; skipping stitch-reconcile-mandates';
      RETURN;
    END IF;
    PERFORM net.http_post(
      url := 'https://bzbuppwzljadulwntjys.supabase.co/functions/v1/stitch-reconcile-mandates',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-secret', internal_secret
      ),
      body := jsonb_build_object('cron', true)
    );
  END
  $do$;
  $cron$
);