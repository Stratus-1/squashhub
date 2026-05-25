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
  target_club uuid;
  should_send boolean := false;
  edge_url text;
BEGIN
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
    SELECT COALESCE(target_user, user_id), club_id
      INTO target_user, target_club
    FROM public.club_members
    WHERE id = NEW.club_member_id;
  END IF;

  IF target_club IS NULL AND (NEW.data ? 'champ_id') THEN
    SELECT club_id INTO target_club
    FROM public.club_champs
    WHERE id = (NEW.data->>'champ_id')::uuid;
  END IF;

  IF target_user IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT email INTO target_email
  FROM public.profiles
  WHERE id = target_user;

  IF target_email IS NULL OR length(trim(target_email)) = 0 THEN
    RETURN NEW;
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
      'clubId', target_club,
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
$function$;