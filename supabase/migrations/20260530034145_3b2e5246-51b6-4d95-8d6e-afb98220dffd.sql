
CREATE OR REPLACE FUNCTION public.deliver_email_for_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  internal_secret text;
  request_id bigint;
  target_email text;
  target_user uuid;
  target_name text;
  target_club_id uuid;
  should_send boolean := false;
  edge_url text;
BEGIN
  -- Per-notification opt-out
  IF COALESCE(NEW.data->>'suppress_email', 'false') = 'true' THEN
    RETURN NEW;
  END IF;

  IF NEW.type IN ('challenge', 'match', 'booking', 'marketing', 'admin', 'reminder') THEN
    should_send := true;
  ELSIF NEW.type IN ('tournament_invite', 'tournament_partner_invite', 'tournament_paid', 'tournament_partner_confirmed')
        AND COALESCE(NEW.data->>'send_email', 'false') = 'true' THEN
    should_send := true;
  END IF;

  IF NOT should_send THEN
    RETURN NEW;
  END IF;

  target_user := NEW.user_id;
  IF NEW.club_member_id IS NOT NULL THEN
    SELECT cm.user_id, cm.email, cm.name, cm.club_id
    INTO target_user, target_email, target_name, target_club_id
    FROM public.club_members cm
    WHERE cm.id = NEW.club_member_id;

    target_user := COALESCE(NEW.user_id, target_user);
  END IF;

  IF target_user IS NOT NULL THEN
    SELECT COALESCE(NULLIF(trim(p.email), ''), target_email), COALESCE(NULLIF(trim(p.name), ''), target_name)
    INTO target_email, target_name
    FROM public.profiles p
    WHERE p.id = target_user;
  END IF;

  IF target_email IS NULL OR length(trim(target_email)) = 0 THEN
    RETURN NEW;
  END IF;

  IF target_club_id IS NULL AND (NEW.data ? 'club_id') THEN
    target_club_id := (NEW.data->>'club_id')::uuid;
  END IF;

  SELECT value INTO internal_secret
  FROM public.app_settings
  WHERE key = 'email_private_internal_secret';

  IF internal_secret IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT value INTO edge_url
  FROM public.app_settings
  WHERE key = 'email_edge_function_url';

  IF edge_url IS NULL OR length(trim(edge_url)) = 0 THEN
    edge_url := 'https://bzbuppwzljadulwntjys.supabase.co/functions/v1/email-notifications?action=send';
  END IF;

  SELECT net.http_post(
    url := edge_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', internal_secret
    ),
    body := jsonb_build_object(
      'targetUserId', target_user,
      'targetEmail', target_email,
      'targetName', target_name,
      'clubId', target_club_id,
      'title', NEW.title,
      'message', NEW.message,
      'url', NEW.url,
      'type', NEW.type,
      'data', NEW.data
    )
  ) INTO request_id;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.deliver_web_push_for_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  internal_secret text;
  request_id bigint;
  target_url text;
BEGIN
  -- Per-notification opt-out
  IF COALESCE(NEW.data->>'suppress_push', 'false') = 'true' THEN
    RETURN NEW;
  END IF;

  SELECT value
  INTO internal_secret
  FROM public.app_settings
  WHERE key = 'push_private_internal_secret';

  IF internal_secret IS NULL THEN
    RETURN NEW;
  END IF;

  target_url := COALESCE(NULLIF(trim(NEW.url), ''), '/notifications');

  IF NEW.type = 'marketing' OR target_url = '/notifications' THEN
    target_url := '/notifications?notificationId=' || NEW.id::text;
  END IF;

  IF target_url LIKE '/%' AND position('notificationId=' in target_url) = 0 THEN
    target_url := target_url
      || CASE WHEN position('?' in target_url) > 0 THEN '&' ELSE '?' END
      || 'notificationId=' || NEW.id::text;
  END IF;

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
$function$;
