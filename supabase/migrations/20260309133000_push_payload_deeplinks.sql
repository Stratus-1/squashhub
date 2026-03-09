-- Push payload deeplinks
-- Ensure web/native push opens the *notification's* stored URL (not just /notifications),
-- and passes the notification `data` payload through to the push handler.

CREATE OR REPLACE FUNCTION public.deliver_web_push_for_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  internal_secret text;
  request_id bigint;
  target_url text;
BEGIN
  SELECT value
  INTO internal_secret
  FROM public.app_settings
  WHERE key = 'push_private_internal_secret';

  IF internal_secret IS NULL THEN
    RETURN NEW;
  END IF;

  target_url := COALESCE(NULLIF(trim(NEW.url), ''), '/notifications');

  -- Fire-and-forget push delivery (pg_net is async).
  SELECT net.http_post(
    url := 'https://awbrbrcdowoxsvarhzeg.supabase.co/functions/v1/push-notifications?action=send',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', internal_secret
    ),
    body := jsonb_build_object(
      'targetUserId', NEW.user_id,
      'title', NEW.title,
      'body', NEW.message,
      'url', target_url,
      'tag', NEW.id::text,
      'icon', '/pwa-192x192.png',
      'data', jsonb_build_object('notification_id', NEW.id) || COALESCE(NEW.data, '{}'::jsonb)
    )
  )
  INTO request_id;

  RETURN NEW;
END;
$$;
