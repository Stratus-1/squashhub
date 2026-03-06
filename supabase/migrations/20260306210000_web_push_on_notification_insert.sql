-- Web push delivery for in-app notifications (PWA)
-- When a row is inserted into public.notifications, attempt to deliver a Web Push notification
-- to the user's subscribed endpoints via the `push-notifications` edge function.

-- Extensions used for secure token generation and HTTP calls.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Internal secret shared between Postgres trigger -> edge function.
-- Stored in app_settings under a "private" key so authenticated clients cannot read it via RLS.
INSERT INTO public.app_settings (key, value)
VALUES ('push_private_internal_secret', encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.deliver_web_push_for_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  internal_secret text;
  request_id bigint;
BEGIN
  SELECT value
  INTO internal_secret
  FROM public.app_settings
  WHERE key = 'push_private_internal_secret';

  IF internal_secret IS NULL THEN
    RETURN NEW;
  END IF;

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
      'url', '/notifications',
      'tag', NEW.id::text,
      'icon', '/pwa-192x192.png'
    )
  )
  INTO request_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS deliver_web_push_for_notification_trigger ON public.notifications;
CREATE TRIGGER deliver_web_push_for_notification_trigger
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.deliver_web_push_for_notification();

