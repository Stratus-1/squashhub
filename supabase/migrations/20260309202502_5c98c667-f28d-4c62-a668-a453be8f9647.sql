
-- Fix push and email trigger functions to use the correct Supabase project URL.
-- The previous migrations hardcoded the wrong project reference.

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

  -- Marketing notifications should open their full content inside the app.
  IF NEW.type = 'marketing' OR target_url = '/notifications' THEN
    target_url := '/notifications?notificationId=' || NEW.id::text;
  END IF;

  -- Always include notificationId on internal links so the app can mark it read on open.
  IF target_url LIKE '/%' AND position('notificationId=' in target_url) = 0 THEN
    target_url := target_url
      || CASE WHEN position('?' in target_url) > 0 THEN '&' ELSE '?' END
      || 'notificationId=' || NEW.id::text;
  END IF;

  -- Fire-and-forget push delivery (pg_net is async).
  SELECT net.http_post(
    url := 'https://fakovjdojqdwdsrkuuwm.supabase.co/functions/v1/push-notifications?action=send',
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

-- Recreate the trigger to ensure it's attached
DROP TRIGGER IF EXISTS deliver_web_push_for_notification_trigger ON public.notifications;
CREATE TRIGGER deliver_web_push_for_notification_trigger
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.deliver_web_push_for_notification();

-- Fix the email notification trigger function URL as well
CREATE OR REPLACE FUNCTION public.deliver_email_for_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  internal_secret text;
  request_id bigint;
  target_email text;
BEGIN
  -- Only fire for certain notification types that warrant an email.
  IF NEW.type NOT IN ('challenge', 'match', 'booking', 'marketing', 'admin', 'reminder') THEN
    RETURN NEW;
  END IF;

  -- Look up user email
  SELECT email INTO target_email
  FROM public.profiles
  WHERE id = NEW.user_id;

  IF target_email IS NULL OR length(trim(target_email)) = 0 THEN
    RETURN NEW;
  END IF;

  SELECT value
  INTO internal_secret
  FROM public.app_settings
  WHERE key = 'email_private_internal_secret';

  IF internal_secret IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT net.http_post(
    url := 'https://fakovjdojqdwdsrkuuwm.supabase.co/functions/v1/email-notifications?action=send',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', internal_secret
    ),
    body := jsonb_build_object(
      'targetUserId', NEW.user_id,
      'title', NEW.title,
      'body', NEW.message,
      'url', NEW.url,
      'tag', NEW.id::text,
      'type', NEW.type,
      'data', NEW.data
    )
  )
  INTO request_id;

  RETURN NEW;
END;
$$;

-- Recreate the email trigger
DROP TRIGGER IF EXISTS deliver_email_for_notification_trigger ON public.notifications;
CREATE TRIGGER deliver_email_for_notification_trigger
  AFTER INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.deliver_email_for_notification();
