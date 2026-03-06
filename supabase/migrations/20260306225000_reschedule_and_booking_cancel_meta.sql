-- Reschedule support + booking cancellation metadata.
--
-- Goals:
-- - Record who cancelled a booking, when, and why.
-- - Allow challenge reschedules without withdrawing the challenge.
-- - Provide an RPC to accept a schedule while cancelling any previously accepted schedule/booking.

-- 1) Add cancellation metadata to bookings
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancel_kind text NOT NULL DEFAULT 'cancel'
    CHECK (cancel_kind IN ('cancel', 'reschedule', 'no_show')),
  ADD COLUMN IF NOT EXISTS cancel_reason text;

-- Populate cancel meta when status flips to cancelled (users often only patch {status:'cancelled'}).
CREATE OR REPLACE FUNCTION public.on_booking_cancel_set_meta()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    NEW.cancelled_at := COALESCE(NEW.cancelled_at, now());
    NEW.cancelled_by := COALESCE(NEW.cancelled_by, auth.uid());
    NEW.cancel_kind := COALESCE(NULLIF(NEW.cancel_kind, ''), 'cancel');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS booking_cancel_set_meta_trigger ON public.bookings;
CREATE TRIGGER booking_cancel_set_meta_trigger
  BEFORE UPDATE OF status ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.on_booking_cancel_set_meta();

-- 2) Only withdraw linked challenges when a booking is cancelled as a true cancellation (not a reschedule).
CREATE OR REPLACE FUNCTION public.withdraw_challenge_on_booking_cancel()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'cancelled'
     AND OLD.status IS DISTINCT FROM 'cancelled'
     AND NEW.challenge_id IS NOT NULL
     AND COALESCE(NEW.cancel_kind, 'cancel') <> 'reschedule'
  THEN
    UPDATE public.challenges
    SET status = 'declined', updated_at = now()
    WHERE id = NEW.challenge_id
      AND status IN ('pending', 'accepted');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3) RPC: accept a proposed schedule and automatically cancel any previously accepted schedule/booking (reschedule flow).
CREATE OR REPLACE FUNCTION public.accept_challenge_schedule(target_schedule_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
  s public.challenge_schedules%rowtype;
  c public.challenges%rowtype;
  prev public.challenge_schedules%rowtype;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO s
  FROM public.challenge_schedules
  WHERE id = target_schedule_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Schedule not found';
  END IF;

  SELECT * INTO c
  FROM public.challenges
  WHERE id = s.challenge_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Challenge not found';
  END IF;

  IF NOT (public.is_admin_or_moderator(uid) OR uid IN (c.challenger_id, c.opponent_id)) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  IF c.status IN ('declined','completed','expired') THEN
    RAISE EXCEPTION 'Cannot schedule a % challenge', c.status;
  END IF;

  -- Cancel any previously accepted schedule (reschedule). Also cancel its booking if present.
  FOR prev IN
    SELECT * FROM public.challenge_schedules
    WHERE challenge_id = s.challenge_id
      AND status = 'accepted'
      AND id <> s.id
  LOOP
    IF prev.booking_id IS NOT NULL THEN
      UPDATE public.bookings
      SET status = 'cancelled',
          cancel_kind = 'reschedule',
          cancel_reason = 'Rescheduled',
          cancelled_by = uid,
          cancelled_at = now()
      WHERE id = prev.booking_id
        AND status <> 'cancelled';
    END IF;

    UPDATE public.challenge_schedules
    SET status = 'cancelled', updated_at = now()
    WHERE id = prev.id;
  END LOOP;

  -- Accept the target schedule (the trigger will create the booking + accept the challenge if needed).
  UPDATE public.challenge_schedules
  SET status = 'accepted', updated_at = now()
  WHERE id = s.id;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_challenge_schedule(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_challenge_schedule(uuid) TO authenticated;

-- 4) Tighten maintenance function: it should not be callable by normal authenticated users.
REVOKE EXECUTE ON FUNCTION public.expire_old_challenges_and_schedules() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.expire_old_challenges_and_schedules() TO service_role;

