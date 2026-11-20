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
  member_email text;
  target_user uuid;
  v_name text;
  member_name text;
  target_club_id uuid;
  should_send boolean := false;
  edge_url text;
  v_recent int := 0;
  v_last timestamptz;
  v_when timestamptz;
  v_shared boolean := false;
  v_title text;
BEGIN
  IF COALESCE(NEW.data->>'suppress_email', 'false') = 'true' THEN
    RETURN NEW;
  END IF;

  IF NEW.type IN ('challenge', 'match', 'booking', 'marketing', 'admin', 'reminder') THEN
    should_send := true;
  ELSIF NEW.type LIKE 'tournament%'
        AND COALESCE(NEW.data->>'send_email', 'false') = 'true' THEN
    should_send := true;
  END IF;

  IF NOT should_send THEN
    RETURN NEW;
  END IF;

  target_user := NEW.user_id;
  IF NEW.club_member_id IS NOT NULL THEN
    SELECT cm.user_id, NULLIF(trim(cm.email), ''), NULLIF(trim(cm.name), ''), cm.club_id
      INTO target_user, member_email, member_name, target_club_id
      FROM public.club_members cm
     WHERE cm.id = NEW.club_member_id;
    target_user := COALESCE(NEW.user_id, target_user);
  END IF;
  target_email := member_email;
  v_name := member_name;

  -- A family sharing one login: several members of this club on the same login.
  IF NEW.club_member_id IS NOT NULL AND target_user IS NOT NULL AND target_club_id IS NOT NULL THEN
    SELECT count(*) > 1 INTO v_shared
      FROM public.club_members cm
     WHERE cm.user_id = target_user AND cm.club_id = target_club_id;
  END IF;

  IF target_user IS NOT NULL THEN
    SELECT CASE WHEN v_shared AND member_email IS NOT NULL THEN member_email
                ELSE COALESCE(NULLIF(trim(p.email), ''), member_email) END,
           -- The notice is for this member: greet them by their own name, never the login owner's.
           COALESCE(member_name, NULLIF(trim(p.name), ''))
      INTO target_email, v_name
      FROM public.profiles p
     WHERE p.id = target_user;
    IF NOT FOUND THEN
      target_email := member_email;
      v_name := member_name;
    END IF;
  END IF;

  IF target_email IS NULL OR length(trim(target_email)) = 0 THEN
    RETURN NEW;
  END IF;

  IF target_club_id IS NULL AND (NEW.data ? 'club_id') THEN
    target_club_id := (NEW.data->>'club_id')::uuid;
  END IF;

  -- Address shared by several members of this club (e.g. family email) also counts as shared.
  IF NOT v_shared AND NEW.club_member_id IS NOT NULL AND target_club_id IS NOT NULL THEN
    SELECT count(*) > 1 INTO v_shared
      FROM public.club_members cm
     WHERE cm.club_id = target_club_id AND lower(trim(cm.email)) = lower(trim(target_email));
  END IF;

  v_title := COALESCE(NULLIF(NEW.title, ''), 'Notification');
  IF v_shared AND member_name IS NOT NULL THEN
    v_title := 'For ' || member_name || ': ' || v_title;
  END IF;

  IF target_club_id IS NOT NULL THEN
    SELECT count(*), max(scheduled_for)
      INTO v_recent, v_last
      FROM public.email_outbox
     WHERE club_id = target_club_id
       AND status IN ('queued', 'sending');

    IF v_recent = 0 THEN
      SELECT count(*) INTO v_recent
        FROM public.email_send_log
       WHERE club_id = target_club_id
         AND created_at > now() - interval '5 minutes';
      v_recent := GREATEST(v_recent - 4, 0);
    END IF;

    IF v_recent > 0 THEN
      v_when := GREATEST(COALESCE(v_last, now()) + interval '90 seconds', now());
      INSERT INTO public.email_outbox (
        club_id, club_member_id, recipient_email, recipient_name,
        subject, body, url, cta_label, kind, scheduled_for
      ) VALUES (
        target_club_id, NEW.club_member_id, target_email, v_name,
        v_title, COALESCE(NEW.message, ''), NEW.url,
        CASE WHEN NEW.type IN ('tournament_invite','tournament_partner_invite')
             THEN 'Accept / Register' ELSE 'Open in SquashHub' END,
        NEW.type, v_when
      );
      RETURN NEW;
    END IF;
  END IF;

  SELECT value INTO internal_secret FROM public.app_settings WHERE key = 'email_private_internal_secret';
  IF internal_secret IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT value INTO edge_url FROM public.app_settings WHERE key = 'email_edge_function_url';
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
      'targetName', v_name,
      'clubId', target_club_id,
      'title', v_title,
      'body', NEW.message,
      'message', NEW.message,
      'url', NEW.url,
      'type', NEW.type,
      'data', NEW.data
    )
  ) INTO request_id;

  RETURN NEW;
END;
$function$;