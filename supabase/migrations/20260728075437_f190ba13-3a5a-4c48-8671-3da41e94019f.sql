insert into public.app_settings (key, value)
values ('stitch_private_internal_secret', '8bd691f01a0ce4643bc9c57921ca1ccf7aea657df19ba0a00606a6edcd224f42')
on conflict (key) do update set value = excluded.value;

select cron.unschedule('stitch-reconcile-mandates-2h');

select cron.schedule(
  'stitch-reconcile-mandates-2h',
  '17 */2 * * *',
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