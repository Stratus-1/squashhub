INSERT INTO public.app_settings (key, value)
VALUES ('whatsapp_templates_internal_secret', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (key) DO NOTHING;

DO $$
BEGIN
  PERFORM cron.unschedule('whatsapp-templates-autosync-hourly');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'whatsapp-templates-autosync-hourly',
  '17 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://bzbuppwzljadulwntjys.supabase.co/functions/v1/whatsapp-templates-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', (SELECT value FROM public.app_settings WHERE key = 'whatsapp_templates_internal_secret')
    ),
    body := jsonb_build_object('pending_only', true)
  );
  $cron$
);