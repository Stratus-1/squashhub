-- 1. Ensure the internal secret used by the court-lights scheduled sweep exists.
INSERT INTO public.app_settings (key, value)
VALUES ('lights_private_internal_secret', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (key) DO NOTHING;

-- 2. Schedule the court-lights sweep every minute.
DO $$
DECLARE
  v_secret text;
BEGIN
  SELECT value INTO v_secret
    FROM public.app_settings
    WHERE key = 'lights_private_internal_secret';

  -- Drop any pre-existing job so we can re-create it idempotently with the
  -- current secret value.
  PERFORM cron.unschedule('court-lights-sweep')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'court-lights-sweep');

  PERFORM cron.schedule(
    'court-lights-sweep',
    '* * * * *',
    format($cron$
      SELECT net.http_post(
        url := 'https://bzbuppwzljadulwntjys.supabase.co/functions/v1/court-lights',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-internal-secret', %L
        ),
        body := jsonb_build_object('triggered_at', now())
      );
    $cron$, v_secret)
  );
END $$;