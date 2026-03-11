-- Guards to prevent:
-- - Multiple active challenges per player (reduces overbooking / too many games).
-- - A player being double-booked across courts at overlapping times.

-- 1) Prevent challenging a player who already has an active (pending/accepted) challenge.
CREATE OR REPLACE FUNCTION public.prevent_multiple_active_challenges()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
BEGIN
  uid := auth.uid();

  -- Allow system/service operations (no auth context).
  IF uid IS NULL THEN
    RETURN NEW;
  END IF;

  -- Allow admin/moderator override if needed.
  IF public.is_admin_or_moderator(uid) THEN
    RETURN NEW;
  END IF;

  IF NEW.status NOT IN ('pending', 'accepted') THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.challenges c
    WHERE c.status IN ('pending', 'accepted')
      AND (c.challenger_id = NEW.opponent_id OR c.opponent_id = NEW.opponent_id)
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'Opponent already has an active challenge';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_multiple_active_challenges_trigger ON public.challenges;
CREATE TRIGGER prevent_multiple_active_challenges_trigger
  BEFORE INSERT ON public.challenges
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_multiple_active_challenges();

-- 2) Prevent participant double-booking at overlapping times (across courts too)
CREATE OR REPLACE FUNCTION public.prevent_booking_participant_overlaps()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  participants uuid[];
  new_range tsrange;
BEGIN
  IF NEW.status IS DISTINCT FROM 'active' THEN
    RETURN NEW;
  END IF;

  participants := array_remove(ARRAY[NEW.user_id, NEW.opponent_id], NULL);
  IF participants IS NULL OR array_length(participants, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  new_range := tsrange(
    (NEW.date::timestamp + NEW.start_time),
    (NEW.date::timestamp + NEW.end_time),
    '[)'
  );

  IF EXISTS (
    SELECT 1
    FROM public.bookings b
    WHERE b.status = 'active'
      AND b.id <> NEW.id
      AND b.date = NEW.date
      AND tsrange((b.date::timestamp + b.start_time), (b.date::timestamp + b.end_time), '[)') && new_range
      AND (
        (b.user_id IS NOT NULL AND b.user_id = ANY(participants))
        OR (b.opponent_id IS NOT NULL AND b.opponent_id = ANY(participants))
      )
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'This time conflicts with an existing booking for one of the players';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_booking_participant_overlaps_trigger ON public.bookings;
CREATE TRIGGER prevent_booking_participant_overlaps_trigger
  BEFORE INSERT OR UPDATE OF status, date, start_time, end_time, user_id, opponent_id
  ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_booking_participant_overlaps();
