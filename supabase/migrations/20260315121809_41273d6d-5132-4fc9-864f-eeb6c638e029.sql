
-- Update validate_challenge_update to support member_id-based identity checks
CREATE OR REPLACE FUNCTION public.validate_challenge_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid;
  match_confirmed boolean;
  is_opponent boolean;
  is_challenger boolean;
BEGIN
  uid := auth.uid();

  -- Determine participant identity using member_id when user_id is null
  is_opponent := (uid IS NOT NULL AND uid = OLD.opponent_id);
  IF NOT is_opponent AND OLD.opponent_member_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.club_members WHERE id = OLD.opponent_member_id AND user_id = uid
    ) INTO is_opponent;
  END IF;

  is_challenger := (uid IS NOT NULL AND uid = OLD.challenger_id);
  IF NOT is_challenger AND OLD.challenger_member_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.club_members WHERE id = OLD.challenger_member_id AND user_id = uid
    ) INTO is_challenger;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- pending -> accepted (only opponent can accept)
    IF OLD.status = 'pending' AND NEW.status = 'accepted' THEN
      IF NOT is_opponent THEN
        RAISE EXCEPTION 'Only the challenged player can accept this challenge';
      END IF;
      RETURN NEW;
    END IF;

    -- pending -> declined (opponent declines OR challenger withdraws)
    IF OLD.status = 'pending' AND NEW.status = 'declined' THEN
      IF NOT is_opponent AND NOT is_challenger THEN
        RAISE EXCEPTION 'Only participants can decline or withdraw this challenge';
      END IF;
      RETURN NEW;
    END IF;

    -- accepted -> completed (only after confirmed match exists)
    IF OLD.status = 'accepted' AND NEW.status = 'completed' THEN
      SELECT EXISTS (
        SELECT 1 FROM public.matches
        WHERE challenge_id = OLD.id AND confirmed = true
      ) INTO match_confirmed;

      IF NOT match_confirmed THEN
        RAISE EXCEPTION 'Cannot complete a challenge without a confirmed match';
      END IF;
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Invalid challenge status transition: % -> %', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$;
