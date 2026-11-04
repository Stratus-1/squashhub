DO $$
DECLARE s text;
BEGIN
  SELECT value INTO s FROM public.app_settings WHERE key = 'auto_progress_private_secret';
  IF s IS NOT NULL THEN
    PERFORM net.http_post(
      url := 'https://bzbuppwzljadulwntjys.supabase.co/functions/v1/auto-progress-tournaments',
      headers := jsonb_build_object('Content-Type','application/json','x-internal-secret', s),
      body := jsonb_build_object('tid', 'f954222a-0f0a-4d8c-ac7b-9c74042cc69e'));
  END IF;
END $$;