ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS result_verify_email boolean NOT NULL DEFAULT true;
COMMENT ON COLUMN public.clubs.result_verify_email IS 'Email the opponent asking them to verify an entered match result';

CREATE OR REPLACE FUNCTION public.notify_on_match_events()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  submitter_name text; opponent_user_id uuid; opponent_member_id uuid;
  v_email text; v_name text; v_mid uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.submitted_by IS NULL AND NEW.submitted_by_member_id IS NULL THEN RETURN NEW; END IF;
    IF NEW.submitted_by IS NOT NULL THEN SELECT name INTO submitter_name FROM public.profiles WHERE id = NEW.submitted_by; END IF;
    IF submitter_name IS NULL AND NEW.submitted_by_member_id IS NOT NULL THEN
      SELECT name INTO submitter_name FROM public.club_members WHERE id = NEW.submitted_by_member_id;
    END IF;
    IF NEW.submitted_by_member_id IS NOT NULL THEN
      opponent_member_id := CASE
        WHEN NEW.submitted_by_member_id = NEW.player_a_member_id THEN NEW.player_b_member_id
        WHEN NEW.submitted_by_member_id = NEW.player_b_member_id THEN NEW.player_a_member_id
        ELSE NULL END;
    END IF;
    opponent_user_id := CASE WHEN NEW.submitted_by = NEW.player_a THEN NEW.player_b
      WHEN NEW.submitted_by = NEW.player_b THEN NEW.player_a ELSE NULL END;
    IF opponent_user_id = NEW.submitted_by AND opponent_member_id IS NULL THEN RETURN NEW; END IF;

    IF opponent_user_id IS NOT NULL OR opponent_member_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, club_member_id, title, message, type, url, data)
      VALUES (COALESCE(opponent_user_id, '00000000-0000-0000-0000-000000000000'), opponent_member_id,
        'Match result submitted',
        COALESCE(submitter_name, 'Your opponent') || ' submitted a match result vs you. Please confirm or dispute.',
        'match', '/challenges', jsonb_build_object('match_id', NEW.id));

      BEGIN
        IF COALESCE((SELECT result_verify_email FROM public.clubs WHERE id = NEW.club_id), true) THEN
          IF opponent_member_id IS NOT NULL THEN
            SELECT id, name, trim(email) INTO v_mid, v_name, v_email FROM public.club_members WHERE id = opponent_member_id;
          ELSIF NEW.club_id IS NOT NULL THEN
            SELECT id, name, trim(email) INTO v_mid, v_name, v_email FROM public.club_members
             WHERE user_id = opponent_user_id AND club_id = NEW.club_id LIMIT 1;
          END IF;
          IF v_email IS NOT NULL AND v_email LIKE '%@%'
             AND NOT EXISTS (SELECT 1 FROM public.email_outbox WHERE kind = 'match_result_verify' AND ref_id = NEW.id AND recipient_email = v_email) THEN
            INSERT INTO public.email_outbox (club_id, club_member_id, recipient_email, recipient_name, subject, body, url, cta_label, kind, ref_id)
            VALUES (NEW.club_id, v_mid, v_email, v_name, 'Please verify your match result',
              COALESCE(submitter_name, 'Your opponent') || ' has entered a result for your match. Please log in to the SquashHub app to confirm or dispute the result.',
              '/challenges', 'Verify result', 'match_result_verify', NEW.id);
          END IF;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'match verify email queue failed: %', SQLERRM;
      END;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.confirmed IS TRUE AND OLD.confirmed IS DISTINCT FROM TRUE THEN
    INSERT INTO public.notifications (user_id, club_member_id, title, message, type, url, data) VALUES
      (COALESCE(NEW.player_a, '00000000-0000-0000-0000-000000000000'), NEW.player_a_member_id, 'Match confirmed', 'Your match has been confirmed.', 'match', '/challenges', jsonb_build_object('match_id', NEW.id)),
      (COALESCE(NEW.player_b, '00000000-0000-0000-0000-000000000000'), NEW.player_b_member_id, 'Match confirmed', 'Your match has been confirmed.', 'match', '/challenges', jsonb_build_object('match_id', NEW.id));
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.disputed IS TRUE AND OLD.disputed IS DISTINCT FROM TRUE THEN
    INSERT INTO public.notifications (user_id, club_member_id, title, message, type, url, data) VALUES
      (COALESCE(NEW.player_a, '00000000-0000-0000-0000-000000000000'), NEW.player_a_member_id, 'Match disputed', 'This match has been disputed. An admin may review and resolve it.', 'match', '/challenges', jsonb_build_object('match_id', NEW.id)),
      (COALESCE(NEW.player_b, '00000000-0000-0000-0000-000000000000'), NEW.player_b_member_id, 'Match disputed', 'This match has been disputed. An admin may review and resolve it.', 'match', '/challenges', jsonb_build_object('match_id', NEW.id));
    INSERT INTO public.notifications (user_id, title, message, type, url, data)
    SELECT ur.user_id, 'Match dispute requires review', 'A match has been disputed and needs admin review.', 'match', '/admin', jsonb_build_object('match_id', NEW.id)
    FROM public.user_roles ur WHERE ur.role IN ('admin'::public.app_role, 'moderator'::public.app_role);
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$function$;