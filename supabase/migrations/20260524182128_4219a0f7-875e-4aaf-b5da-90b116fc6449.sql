
ALTER TABLE public.club_champs
  ADD COLUMN IF NOT EXISTS description text;

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
  v_invite_msg TEXT;
BEGIN
  SELECT id, name, club_id, match_type, gender, invite_methods, description
  INTO v_champ
  FROM club_champs
  WHERE id = COALESCE(NEW.champ_id, OLD.champ_id);

  IF v_champ IS NULL THEN
    RETURN NEW;
  END IF;

  v_methods := COALESCE(v_champ.invite_methods, ARRAY['app']::text[]);
  v_send_app := 'app' = ANY(v_methods);
  v_send_email := 'email' = ANY(v_methods);

  v_invite_msg := 'You have been invited to ' || v_champ.name || '.';
  IF v_champ.description IS NOT NULL AND length(trim(v_champ.description)) > 0 THEN
    v_invite_msg := v_invite_msg || E'\n\n' || v_champ.description;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.invited_by_admin THEN
    IF v_send_app THEN
      INSERT INTO public.notifications (club_member_id, title, message, type, url, data)
      VALUES (
        NEW.club_member_id,
        'Tournament invitation',
        v_invite_msg,
        'tournament_invite',
        '/club-champs/' || v_champ.id,
        jsonb_build_object(
          'champ_id', v_champ.id,
          'registration_id', NEW.id,
          'send_email', v_send_email,
          'description', v_champ.description
        )
      );
    ELSIF v_send_email THEN
      INSERT INTO public.notifications (club_member_id, title, message, type, url, data, read)
      VALUES (
        NEW.club_member_id,
        'Tournament invitation',
        v_invite_msg,
        'tournament_invite',
        '/club-champs/' || v_champ.id,
        jsonb_build_object(
          'champ_id', v_champ.id,
          'registration_id', NEW.id,
          'send_email', true,
          'app_silent', true,
          'description', v_champ.description
        ),
        true
      );
    END IF;
  END IF;

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
