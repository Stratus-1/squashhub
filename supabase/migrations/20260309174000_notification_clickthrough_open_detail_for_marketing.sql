-- Notification click-through behavior
-- - For marketing notifications (and any notification with url=/notifications), make push open the in-app detail view.
-- - Keeps `notifications.url` unchanged for emails / in-app navigation; only the push payload URL is overridden.

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
  -- Also, if the url is the generic notifications list, open the specific notification.
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
