-- Auto-clear resolved invite notifications inside the existing registration trigger
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

  -- Resolved registration: clear any outstanding invite/partner notifications
  -- for this entry so a settled invite can never re-pop on the recipient's app.
  IF TG_OP = 'UPDATE' AND NEW.status IN ('paid', 'waived', 'declined', 'cancelled')
     AND COALESCE(OLD.status, '') IS DISTINCT FROM NEW.status THEN
    UPDATE public.notifications
       SET read = true
     WHERE NOT read
       AND type IN ('tournament_invite', 'tournament_partner_invite', 'tournament_doubles_pair')
       AND club_member_id IN (NEW.club_member_id, NEW.partner_member_id)
       AND (
         data->>'registration_id' = NEW.id::text
         OR (data->>'champ_id' = NEW.champ_id::text
             AND club_member_id IN (NEW.club_member_id, NEW.partner_member_id))
       );
  END IF;

  -- Partner confirmed: the invite has been answered — clear it immediately.
  IF TG_OP = 'UPDATE'
     AND NEW.partner_confirmed = true
     AND COALESCE(OLD.partner_confirmed, false) = false THEN
    UPDATE public.notifications
       SET read = true
     WHERE NOT read
       AND type IN ('tournament_partner_invite', 'tournament_doubles_pair')
       AND club_member_id = NEW.partner_member_id
       AND data->>'champ_id' = NEW.champ_id::text;
  END IF;

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

-- Backlog sweep: silence stale unread invite/partner notifications whose
-- registration is already resolved or whose partner is already confirmed.
UPDATE public.notifications n
   SET read = true
 FROM public.club_champs_registrations r
 WHERE NOT n.read
   AND n.type IN ('tournament_invite', 'tournament_partner_invite', 'tournament_doubles_pair')
   AND (
     (n.data->>'registration_id' = r.id::text
        AND (r.status IN ('paid','waived','declined','cancelled') OR r.partner_confirmed = true))
     OR (n.data->>'champ_id' = r.champ_id::text
        AND n.club_member_id = r.partner_member_id
        AND r.partner_confirmed = true)
   );