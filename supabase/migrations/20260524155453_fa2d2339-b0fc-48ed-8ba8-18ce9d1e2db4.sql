
-- 1) Add invite_methods column
ALTER TABLE public.club_champs
  ADD COLUMN IF NOT EXISTS invite_methods text[] NOT NULL DEFAULT ARRAY['app']::text[];

-- 2) Update notify_champ_registration_event to honor invite_methods
CREATE OR REPLACE FUNCTION public.notify_champ_registration_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_champ RECORD;
  v_member_name TEXT;
  v_partner_name TEXT;
  v_methods TEXT[];
  v_send_app BOOLEAN;
  v_send_email BOOLEAN;
  v_target_user UUID;
  v_target_email TEXT;
  v_internal_secret TEXT;
  v_supabase_url TEXT;
BEGIN
  SELECT id, name, club_id, match_type, gender, invite_methods
  INTO v_champ
  FROM club_champs
  WHERE id = COALESCE(NEW.champ_id, OLD.champ_id);

  IF v_champ IS NULL THEN
    RETURN NEW;
  END IF;

  v_methods := COALESCE(v_champ.invite_methods, ARRAY['app']::text[]);
  v_send_app := 'app' = ANY(v_methods);
  v_send_email := 'email' = ANY(v_methods);

  -- INSERT: admin-invited
  IF TG_OP = 'INSERT' AND NEW.invited_by_admin THEN
    IF v_send_app THEN
      INSERT INTO public.notifications (club_member_id, title, message, type, url, data)
      VALUES (
        NEW.club_member_id,
        'Tournament invitation',
        'You have been invited to ' || v_champ.name || '.',
        'tournament_invite',
        '/club-champs/' || v_champ.id,
        jsonb_build_object(
          'champ_id', v_champ.id,
          'registration_id', NEW.id,
          'send_email', v_send_email
        )
      );
    ELSIF v_send_email THEN
      -- Email-only: insert a silent notification row so the email trigger fires,
      -- but mark it read + app_silent so it never shows up in the in-app UI
      INSERT INTO public.notifications (club_member_id, title, message, type, url, data, read)
      VALUES (
        NEW.club_member_id,
        'Tournament invitation',
        'You have been invited to ' || v_champ.name || '.',
        'tournament_invite',
        '/club-champs/' || v_champ.id,
        jsonb_build_object(
          'champ_id', v_champ.id,
          'registration_id', NEW.id,
          'send_email', true,
          'app_silent', true
        ),
        true
      );
    END IF;
  END IF;

  -- UPDATE: status moved to paid (entry confirmed) — always app, always email
  IF TG_OP = 'UPDATE'
     AND NEW.status IN ('paid', 'waived')
     AND COALESCE(OLD.status, '') NOT IN ('paid', 'waived') THEN
    INSERT INTO public.notifications (club_member_id, title, message, type, url, data)
    VALUES (
      NEW.club_member_id,
      'Tournament entry confirmed',
      'Your entry for ' || v_champ.name || ' is confirmed.',
      'tournament_paid',
      '/club-champs/' || v_champ.id,
      jsonb_build_object('champ_id', v_champ.id, 'registration_id', NEW.id, 'send_email', true)
    );
  END IF;

  -- UPDATE: partner_member_id set or changed (notify the new partner) — always app+email
  IF TG_OP = 'UPDATE'
     AND NEW.partner_member_id IS NOT NULL
     AND COALESCE(OLD.partner_member_id::text, '') <> NEW.partner_member_id::text THEN
    SELECT COALESCE(cm.name, p.name, 'A member')
    INTO v_member_name
    FROM club_members cm
    LEFT JOIN profiles p ON p.id = cm.user_id
    WHERE cm.id = NEW.club_member_id;

    INSERT INTO public.notifications (club_member_id, title, message, type, url, data)
    VALUES (
      NEW.partner_member_id,
      'Doubles partner invite',
      v_member_name || ' wants to partner with you in ' || v_champ.name || '.',
      'tournament_partner_invite',
      '/club-champs/' || v_champ.id,
      jsonb_build_object('champ_id', v_champ.id, 'registration_id', NEW.id, 'invited_by', NEW.club_member_id, 'send_email', true)
    );
  END IF;

  -- UPDATE: partner_confirmed flipped true (notify the registrant)
  IF TG_OP = 'UPDATE'
     AND NEW.partner_confirmed = true
     AND COALESCE(OLD.partner_confirmed, false) = false
     AND NEW.partner_member_id IS NOT NULL THEN
    SELECT COALESCE(cm.name, p.name, 'Your partner')
    INTO v_partner_name
    FROM club_members cm
    LEFT JOIN profiles p ON p.id = cm.user_id
    WHERE cm.id = NEW.partner_member_id;

    INSERT INTO public.notifications (club_member_id, title, message, type, url, data)
    VALUES (
      NEW.club_member_id,
      'Partner confirmed',
      v_partner_name || ' confirmed as your partner for ' || v_champ.name || '.',
      'tournament_partner_confirmed',
      '/club-champs/' || v_champ.id,
      jsonb_build_object('champ_id', v_champ.id, 'registration_id', NEW.id, 'send_email', true)
    );
  END IF;

  RETURN NEW;
END;
$$;

-- 3) Extend deliver_email_for_notification to send emails for tournament_* types
--    when data->>'send_email' = 'true'. Resolve the user_id from club_member_id
--    when notification.user_id is null.
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
  target_user uuid;
  should_send boolean := false;
  edge_url text;
BEGIN
  -- Always allow legacy types
  IF NEW.type IN ('challenge', 'match', 'booking', 'marketing', 'admin', 'reminder') THEN
    should_send := true;
  ELSIF NEW.type IN ('tournament_invite', 'tournament_partner_invite', 'tournament_paid', 'tournament_partner_confirmed')
        AND COALESCE(NEW.data->>'send_email', 'false') = 'true' THEN
    should_send := true;
  END IF;

  IF NOT should_send THEN
    RETURN NEW;
  END IF;

  -- Resolve target user_id (prefer notification.user_id, fall back to club_member's user_id)
  target_user := NEW.user_id;
  IF target_user IS NULL AND NEW.club_member_id IS NOT NULL THEN
    SELECT user_id INTO target_user
    FROM public.club_members
    WHERE id = NEW.club_member_id;
  END IF;

  IF target_user IS NULL THEN
    RETURN NEW;
  END IF;

  -- Look up email
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

  -- Resolve edge function URL from app_settings (fallback to hardcoded project)
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
