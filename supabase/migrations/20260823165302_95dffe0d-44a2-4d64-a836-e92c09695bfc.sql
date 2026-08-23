CREATE OR REPLACE FUNCTION public.notify_champ_registration_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_champ RECORD;
  v_member_name TEXT;
  v_partner_name TEXT;
BEGIN
  SELECT id, name, club_id, match_type, gender, invite_methods, description
  INTO v_champ
  FROM club_champs
  WHERE id = COALESCE(NEW.champ_id, OLD.champ_id);

  IF v_champ IS NULL THEN
    RETURN NEW;
  END IF;

  -- Invitation notifications are NOT sent from this trigger.

  -- Entry confirmed: fire at most ONCE per registration, ever. Admin saves that
  -- bounce a row through invited -> paid must not re-notify the player.
  IF TG_OP = 'UPDATE'
     AND NEW.status IN ('paid', 'waived')
     AND COALESCE(OLD.status, '') NOT IN ('paid', 'waived')
     AND NOT EXISTS (
       SELECT 1 FROM public.notifications n
       WHERE n.type = 'tournament_paid'
         AND n.data->>'registration_id' = NEW.id::text
     ) THEN
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
     AND COALESCE(OLD.partner_member_id::text, '') <> NEW.partner_member_id::text
     AND NOT EXISTS (
       SELECT 1 FROM public.notifications n
       WHERE n.type = 'tournament_partner_invite'
         AND n.club_member_id = NEW.partner_member_id
         AND n.data->>'registration_id' = NEW.id::text
     ) THEN
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
     AND NEW.partner_member_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.notifications n
       WHERE n.type = 'tournament_partner_confirmed'
         AND n.club_member_id = NEW.club_member_id
         AND n.data->>'registration_id' = NEW.id::text
     ) THEN
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
$function$;

-- Clean up the duplicates already sitting in players' notification lists:
-- keep the earliest per registration + type.
DELETE FROM public.notifications n
USING public.notifications keep
WHERE n.type IN ('tournament_paid', 'tournament_partner_invite', 'tournament_partner_confirmed')
  AND keep.type = n.type
  AND keep.data->>'registration_id' = n.data->>'registration_id'
  AND keep.club_member_id IS NOT DISTINCT FROM n.club_member_id
  AND n.data->>'registration_id' IS NOT NULL
  AND (keep.created_at < n.created_at OR (keep.created_at = n.created_at AND keep.id < n.id));