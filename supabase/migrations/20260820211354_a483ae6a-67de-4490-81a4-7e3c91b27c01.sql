-- 1) Allow the secure public invite link as a confirmation source.
ALTER TABLE public.club_champs_registrations
  DROP CONSTRAINT IF EXISTS club_champs_registrations_confirmation_source_check;
ALTER TABLE public.club_champs_registrations
  ADD CONSTRAINT club_champs_registrations_confirmation_source_check
  CHECK (confirmation_source IS NULL OR confirmation_source = ANY (ARRAY['rsvp','payment','admin','invite_link']));

-- 2) Materialising the invite roster must never send invitations.
CREATE OR REPLACE FUNCTION public.notify_champ_registration_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  -- NOTE: invitation notifications are NOT sent from this trigger. Inserting a
  -- registration row only materialises the roster; sending is an explicit
  -- organiser action (public.send_champ_invite_notifications).

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

-- 3) Server-enforced invitation send. The caller supplies the EXACT recipient
-- set; anything else is refused. Never expands to "everyone".
CREATE OR REPLACE FUNCTION public.send_champ_invite_notifications(
  p_champ_id uuid,
  p_recipients jsonb,
  p_title text,
  p_message text,
  p_send_email boolean DEFAULT false,
  p_app_silent boolean DEFAULT false,
  p_description text DEFAULT NULL,
  p_mode text DEFAULT 'selected'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_club_id uuid;
  v_requested int := 0;
  v_sent int := 0;
  v_ids uuid[];
BEGIN
  IF p_champ_id IS NULL THEN
    RAISE EXCEPTION 'Missing tournament';
  END IF;

  SELECT club_id INTO v_club_id FROM public.club_champs WHERE id = p_champ_id;
  IF v_club_id IS NULL THEN
    RAISE EXCEPTION 'Tournament not found';
  END IF;
  IF NOT public.is_club_admin(auth.uid(), v_club_id) THEN
    RAISE EXCEPTION 'Not allowed to send invitations for this tournament';
  END IF;

  IF p_recipients IS NULL OR jsonb_typeof(p_recipients) <> 'array' OR jsonb_array_length(p_recipients) = 0 THEN
    RAISE EXCEPTION 'No recipients supplied — nothing was sent';
  END IF;

  CREATE TEMP TABLE _invite_targets ON COMMIT DROP AS
  SELECT DISTINCT
         (r->>'registration_id')::uuid AS registration_id,
         NULLIF(r->>'url', '')          AS url
    FROM jsonb_array_elements(p_recipients) AS r
   WHERE (r->>'registration_id') IS NOT NULL;

  SELECT count(*) INTO v_requested FROM _invite_targets;
  IF v_requested = 0 THEN
    RAISE EXCEPTION 'No valid recipients supplied — nothing was sent';
  END IF;

  -- Fail closed: every supplied id must belong to this tournament.
  IF EXISTS (
    SELECT 1 FROM _invite_targets t
     WHERE NOT EXISTS (
       SELECT 1 FROM public.club_champs_registrations reg
        WHERE reg.id = t.registration_id AND reg.champ_id = p_champ_id
          AND reg.club_member_id IS NOT NULL
     )
  ) THEN
    RAISE EXCEPTION 'One or more selected recipients are no longer valid for this tournament — nothing was sent';
  END IF;

  INSERT INTO public.notifications (club_member_id, title, message, type, url, data, read)
  SELECT reg.club_member_id,
         COALESCE(NULLIF(p_title, ''), 'Tournament invitation'),
         p_message,
         'tournament_invite',
         COALESCE(t.url, '/club-champs/' || p_champ_id::text),
         jsonb_build_object(
           'champ_id', p_champ_id,
           'registration_id', reg.id,
           'send_email', COALESCE(p_send_email, false),
           'app_silent', COALESCE(p_app_silent, false),
           'description', p_description,
           'send_mode', COALESCE(p_mode, 'selected')
         ),
         false
    FROM _invite_targets t
    JOIN public.club_champs_registrations reg
      ON reg.id = t.registration_id AND reg.champ_id = p_champ_id;

  GET DIAGNOSTICS v_sent = ROW_COUNT;

  UPDATE public.club_champs_registrations reg
     SET invited_by_admin = true,
         invited_at = COALESCE(reg.invited_at, now())
   WHERE reg.champ_id = p_champ_id
     AND reg.id IN (SELECT registration_id FROM _invite_targets);

  SELECT array_agg(registration_id) INTO v_ids FROM _invite_targets;

  INSERT INTO public.audit_events (club_id, actor_user_id, entity_type, entity_id, action, after_data)
  VALUES (
    v_club_id, auth.uid(), 'club_champs', p_champ_id, 'tournament_invites_sent',
    jsonb_build_object(
      'mode', COALESCE(p_mode, 'selected'),
      'requested_count', v_requested,
      'sent_count', v_sent,
      'registration_ids', to_jsonb(v_ids)
    )
  );

  DROP TABLE IF EXISTS _invite_targets;

  RETURN jsonb_build_object('requested', v_requested, 'sent', v_sent, 'mode', COALESCE(p_mode, 'selected'));
END;
$$;

REVOKE ALL ON FUNCTION public.send_champ_invite_notifications(uuid, jsonb, text, text, boolean, boolean, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.send_champ_invite_notifications(uuid, jsonb, text, text, boolean, boolean, text, text) TO authenticated;
