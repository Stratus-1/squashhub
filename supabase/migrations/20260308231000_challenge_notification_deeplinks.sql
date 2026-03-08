-- Challenge notification deep-links
-- Ensure emails/push open the challenge screen with an immediate accept/decline modal.

CREATE OR REPLACE FUNCTION public.notify_on_challenge_events()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  challenger_name text;
  opponent_name text;
  challenger_rank integer;
  opponent_rank integer;
  date_text text;
  link text;
BEGIN
  SELECT name, rank INTO challenger_name, challenger_rank
  FROM public.profiles
  WHERE id = COALESCE(NEW.challenger_id, OLD.challenger_id);

  SELECT name, rank INTO opponent_name, opponent_rank
  FROM public.profiles
  WHERE id = COALESCE(NEW.opponent_id, OLD.opponent_id);

  date_text := COALESCE(NEW.proposed_date::text, OLD.proposed_date::text, NULL);
  link := '/challenges?challengeId=' || COALESCE(NEW.id, OLD.id)::text || '&intent=respond';

  -- New challenge created: notify opponent
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.notifications (user_id, title, message, type, url, data)
    VALUES (
      NEW.opponent_id,
      'New challenge',
      COALESCE(challenger_name, 'A player')
        || ' challenged you'
        || CASE WHEN challenger_rank IS NOT NULL THEN ' (Rank #' || challenger_rank::text || ')' ELSE '' END
        || CASE WHEN date_text IS NOT NULL THEN ' · Proposed: ' || date_text ELSE '' END,
      'challenge',
      link,
      jsonb_build_object('challenge_id', NEW.id)
    );
    RETURN NEW;
  END IF;

  -- Status change: accepted/declined -> notify challenger
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'accepted' THEN
      INSERT INTO public.notifications (user_id, title, message, type, url, data)
      VALUES (
        NEW.challenger_id,
        'Challenge accepted',
        COALESCE(opponent_name, 'Your opponent')
          || ' accepted your challenge'
          || CASE WHEN opponent_rank IS NOT NULL THEN ' (Rank #' || opponent_rank::text || ')' ELSE '' END
          || CASE WHEN date_text IS NOT NULL THEN ' · Date: ' || date_text ELSE '' END,
        'challenge',
        link,
        jsonb_build_object('challenge_id', NEW.id)
      );
    ELSIF NEW.status = 'declined' THEN
      INSERT INTO public.notifications (user_id, title, message, type, url, data)
      VALUES (
        NEW.challenger_id,
        'Challenge declined',
        COALESCE(opponent_name, 'Your opponent')
          || ' declined your challenge'
          || CASE WHEN date_text IS NOT NULL THEN ' · Proposed: ' || date_text ELSE '' END,
        'challenge',
        link,
        jsonb_build_object('challenge_id', NEW.id)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

