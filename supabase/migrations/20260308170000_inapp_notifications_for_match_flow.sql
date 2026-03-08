-- In-app notifications for match lifecycle
-- - Notify opponent when a match result is submitted (needs confirm/dispute)
-- - Notify both players when confirmed
-- - Notify participants + admins when disputed

CREATE OR REPLACE FUNCTION public.notify_on_match_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  submitter_name text;
  opponent_id uuid;
  opponent_name text;
BEGIN
  -- On insert: notify the other player if a submitter is present.
  IF TG_OP = 'INSERT' THEN
    IF NEW.submitted_by IS NULL THEN
      RETURN NEW;
    END IF;

    SELECT name INTO submitter_name FROM public.profiles WHERE id = NEW.submitted_by;

    opponent_id := CASE
      WHEN NEW.submitted_by = NEW.player_a THEN NEW.player_b
      WHEN NEW.submitted_by = NEW.player_b THEN NEW.player_a
      ELSE NULL
    END;

    IF opponent_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, title, message, type, url, data)
      VALUES (
        opponent_id,
        'Match result submitted',
        COALESCE(submitter_name, 'Your opponent') || ' submitted a match result vs you. Please confirm or dispute.',
        'match',
        '/challenges',
        jsonb_build_object('match_id', NEW.id)
      );
    END IF;

    RETURN NEW;
  END IF;

  -- On update: confirmed changed to true
  IF TG_OP = 'UPDATE' AND NEW.confirmed IS TRUE AND OLD.confirmed IS DISTINCT FROM TRUE THEN
    INSERT INTO public.notifications (user_id, title, message, type, url, data)
    VALUES
      (
        NEW.player_a,
        'Match confirmed',
        CASE WHEN NEW.confirmed_by_admin THEN 'An admin confirmed your match.' ELSE 'Your match has been confirmed.' END,
        'match',
        '/challenges',
        jsonb_build_object('match_id', NEW.id)
      ),
      (
        NEW.player_b,
        'Match confirmed',
        CASE WHEN NEW.confirmed_by_admin THEN 'An admin confirmed your match.' ELSE 'Your match has been confirmed.' END,
        'match',
        '/challenges',
        jsonb_build_object('match_id', NEW.id)
      );

    RETURN NEW;
  END IF;

  -- On update: disputed toggled true
  IF TG_OP = 'UPDATE' AND NEW.disputed IS TRUE AND OLD.disputed IS DISTINCT FROM TRUE THEN
    -- Participant notifications
    INSERT INTO public.notifications (user_id, title, message, type, url, data)
    VALUES
      (
        NEW.player_a,
        'Match disputed',
        'This match has been disputed. An admin may review and resolve it.',
        'match',
        '/challenges',
        jsonb_build_object('match_id', NEW.id, 'disputed_by', NEW.disputed_by)
      ),
      (
        NEW.player_b,
        'Match disputed',
        'This match has been disputed. An admin may review and resolve it.',
        'match',
        '/challenges',
        jsonb_build_object('match_id', NEW.id, 'disputed_by', NEW.disputed_by)
      );

    -- Admin notifications
    INSERT INTO public.notifications (user_id, title, message, type, url, data)
    SELECT
      ur.user_id,
      'Match dispute requires review',
      'A match has been disputed and needs admin review.',
      'match',
      '/admin',
      jsonb_build_object('match_id', NEW.id, 'disputed_by', NEW.disputed_by)
    FROM public.user_roles ur
    WHERE ur.role IN ('admin'::public.app_role, 'moderator'::public.app_role);

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_on_match_insert ON public.matches;
CREATE TRIGGER notify_on_match_insert
  AFTER INSERT ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_match_events();

DROP TRIGGER IF EXISTS notify_on_match_update ON public.matches;
CREATE TRIGGER notify_on_match_update
  AFTER UPDATE OF confirmed, disputed, confirmed_by_admin ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_match_events();

