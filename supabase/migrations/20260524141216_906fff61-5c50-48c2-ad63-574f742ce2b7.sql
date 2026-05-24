-- Tournament registration lifecycle notifications
-- Notifies members on: admin invite, payment confirmation, partner invite, partner confirmation

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
BEGIN
  -- Load champ context
  SELECT id, name, club_id, match_type, gender
  INTO v_champ
  FROM club_champs
  WHERE id = COALESCE(NEW.champ_id, OLD.champ_id);

  IF v_champ IS NULL THEN
    RETURN NEW;
  END IF;

  -- INSERT: admin-invited
  IF TG_OP = 'INSERT' AND NEW.invited_by_admin THEN
    INSERT INTO public.notifications (club_member_id, title, message, type, url, data)
    VALUES (
      NEW.club_member_id,
      'Tournament invitation',
      'You have been invited to ' || v_champ.name || '.',
      'tournament_invite',
      '/club-champs/' || v_champ.id,
      jsonb_build_object('champ_id', v_champ.id, 'registration_id', NEW.id)
    );
  END IF;

  -- UPDATE: status moved to paid (entry confirmed)
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
      jsonb_build_object('champ_id', v_champ.id, 'registration_id', NEW.id)
    );
  END IF;

  -- UPDATE: partner_member_id set or changed (notify the new partner)
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
      jsonb_build_object('champ_id', v_champ.id, 'registration_id', NEW.id, 'invited_by', NEW.club_member_id)
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
      jsonb_build_object('champ_id', v_champ.id, 'registration_id', NEW.id)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_champ_registration_event ON public.club_champs_registrations;
CREATE TRIGGER trg_notify_champ_registration_event
AFTER INSERT OR UPDATE ON public.club_champs_registrations
FOR EACH ROW
EXECUTE FUNCTION public.notify_champ_registration_event();

-- Allow a member to confirm/decline a partner invite on a registration they were invited to
DROP POLICY IF EXISTS "Invited partner can confirm own invite" ON public.club_champs_registrations;
CREATE POLICY "Invited partner can confirm own invite"
ON public.club_champs_registrations
FOR UPDATE
TO authenticated
USING (
  partner_member_id IN (
    SELECT id FROM public.club_members WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  partner_member_id IN (
    SELECT id FROM public.club_members WHERE user_id = auth.uid()
  )
);