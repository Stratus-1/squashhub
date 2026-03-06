-- When a booking is cancelled, automatically withdraw any linked challenge.
-- This keeps ladder challenges and court bookings in sync.
--
-- Behavior:
-- - If booking.status changes to 'cancelled' AND booking.challenge_id is set:
--   - Set challenges.status to 'declined' (for pending/accepted challenges only)
-- - Requires validate_challenge_update() to allow accepted -> declined for participants/admins.

-- 1) Allow accepted -> declined (withdrawn) challenge transition
CREATE OR REPLACE FUNCTION public.validate_challenge_update()
RETURNS TRIGGER AS $$
DECLARE
  uid uuid;
  match_confirmed boolean;
BEGIN
  uid := auth.uid();

  -- Admin/moderator overrides
  IF uid IS NOT NULL AND public.is_admin_or_moderator(uid) THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- pending -> accepted (only opponent can accept)
    IF OLD.status = 'pending' AND NEW.status = 'accepted' THEN
      IF uid IS NULL OR uid <> OLD.opponent_id THEN
        RAISE EXCEPTION 'Only the challenged player can accept this challenge';
      END IF;
      RETURN NEW;
    END IF;

    -- pending -> declined (opponent declines OR challenger withdraws)
    IF OLD.status = 'pending' AND NEW.status = 'declined' THEN
      IF uid IS NULL OR (uid <> OLD.opponent_id AND uid <> OLD.challenger_id) THEN
        RAISE EXCEPTION 'Only participants can decline or withdraw this challenge';
      END IF;
      RETURN NEW;
    END IF;

    -- accepted -> declined (either participant can withdraw/cancel)
    IF OLD.status = 'accepted' AND NEW.status = 'declined' THEN
      IF uid IS NULL OR (uid <> OLD.opponent_id AND uid <> OLD.challenger_id) THEN
        RAISE EXCEPTION 'Only participants can withdraw this challenge';
      END IF;
      RETURN NEW;
    END IF;

    -- accepted -> completed (only after confirmed match exists)
    IF OLD.status = 'accepted' AND NEW.status = 'completed' THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.matches
        WHERE challenge_id = OLD.id
          AND confirmed = true
      ) INTO match_confirmed;

      IF NOT match_confirmed THEN
        RAISE EXCEPTION 'Cannot complete a challenge without a confirmed match';
      END IF;
      RETURN NEW;
    END IF;

    -- No other transitions allowed
    RAISE EXCEPTION 'Invalid challenge status transition: % -> %', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2) Withdraw linked challenge when a booking is cancelled
CREATE OR REPLACE FUNCTION public.withdraw_challenge_on_booking_cancel()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' AND NEW.challenge_id IS NOT NULL THEN
    UPDATE public.challenges
    SET status = 'declined', updated_at = now()
    WHERE id = NEW.challenge_id
      AND status IN ('pending', 'accepted');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS withdraw_challenge_on_booking_cancel_trigger ON public.bookings;
CREATE TRIGGER withdraw_challenge_on_booking_cancel_trigger
  AFTER UPDATE OF status ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.withdraw_challenge_on_booking_cancel();

