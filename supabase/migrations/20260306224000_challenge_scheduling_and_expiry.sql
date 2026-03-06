-- Challenge scheduling: propose times, accept/decline/reschedule, auto-expire old challenges.

-- 1) Extend challenge statuses with 'expired' + add expires_at
ALTER TABLE public.challenges
  DROP CONSTRAINT IF EXISTS challenges_status_check;

ALTER TABLE public.challenges
  ADD CONSTRAINT challenges_status_check
  CHECK (status IN ('pending', 'accepted', 'declined', 'completed', 'expired'));

ALTER TABLE public.challenges
  ADD COLUMN IF NOT EXISTS expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days');

CREATE INDEX IF NOT EXISTS challenges_expires_at_idx
  ON public.challenges (expires_at)
  WHERE status IN ('pending','accepted');

-- 2) Allow pending/accepted -> expired only for admin/moderator or "system" (uid is null)
CREATE OR REPLACE FUNCTION public.validate_challenge_update()
RETURNS TRIGGER AS $$
DECLARE
  uid uuid;
  match_confirmed boolean;
BEGIN
  uid := auth.uid();

  IF uid IS NOT NULL AND public.is_admin_or_moderator(uid) THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- system expiry (uid NULL)
    IF uid IS NULL AND NEW.status = 'expired' AND OLD.status IN ('pending','accepted') THEN
      RETURN NEW;
    END IF;

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

    RAISE EXCEPTION 'Invalid challenge status transition: % -> %', OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3) Scheduling proposals per challenge
CREATE TABLE IF NOT EXISTS public.challenge_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenge_id uuid NOT NULL REFERENCES public.challenges(id) ON DELETE CASCADE,
  proposed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  proposed_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  court_id integer REFERENCES public.courts(id),
  booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','accepted','declined','cancelled','expired')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS challenge_schedules_challenge_idx
  ON public.challenge_schedules (challenge_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS challenge_schedules_one_accepted_idx
  ON public.challenge_schedules (challenge_id)
  WHERE status = 'accepted';

ALTER TABLE public.challenge_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Challenge schedules viewable by participants" ON public.challenge_schedules;
CREATE POLICY "Challenge schedules viewable by participants"
  ON public.challenge_schedules FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.challenges c
      WHERE c.id = challenge_id
        AND (auth.uid() = c.challenger_id OR auth.uid() = c.opponent_id OR public.is_admin_or_moderator(auth.uid()))
    )
  );

DROP POLICY IF EXISTS "Challenge schedules insert by participants" ON public.challenge_schedules;
CREATE POLICY "Challenge schedules insert by participants"
  ON public.challenge_schedules FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = proposed_by
    AND EXISTS (
      SELECT 1 FROM public.challenges c
      WHERE c.id = challenge_id
        AND c.status IN ('pending','accepted')
        AND auth.uid() IN (c.challenger_id, c.opponent_id)
    )
  );

DROP POLICY IF EXISTS "Challenge schedules update by participants" ON public.challenge_schedules;
CREATE POLICY "Challenge schedules update by participants"
  ON public.challenge_schedules FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.challenges c
      WHERE c.id = challenge_id
        AND auth.uid() IN (c.challenger_id, c.opponent_id)
    )
  );

DROP TRIGGER IF EXISTS update_challenge_schedules_updated_at ON public.challenge_schedules;
CREATE TRIGGER update_challenge_schedules_updated_at
  BEFORE UPDATE ON public.challenge_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) When a schedule is accepted, create a booking and set challenge accepted.
CREATE OR REPLACE FUNCTION public.apply_accepted_challenge_schedule()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c public.challenges%rowtype;
  booking_row public.bookings%rowtype;
BEGIN
  IF NEW.status <> 'accepted' OR OLD.status = 'accepted' THEN
    RETURN NEW;
  END IF;

  SELECT * INTO c FROM public.challenges WHERE id = NEW.challenge_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Challenge not found';
  END IF;

  -- Expired/declined/completed challenges can't be scheduled.
  IF c.status NOT IN ('pending','accepted') THEN
    RAISE EXCEPTION 'Cannot accept a schedule for a % challenge', c.status;
  END IF;

  -- If there is already an accepted schedule, block.
  IF EXISTS (
    SELECT 1 FROM public.challenge_schedules
    WHERE challenge_id = NEW.challenge_id AND status = 'accepted' AND id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'A schedule is already accepted for this challenge';
  END IF;

  -- Create booking (will fail if overlaps due to existing overlap constraints)
  INSERT INTO public.bookings (court_id, user_id, opponent_id, date, start_time, end_time, status, is_friendly, challenge_id)
  VALUES (
    COALESCE(NEW.court_id, 1),
    c.challenger_id,
    c.opponent_id,
    NEW.proposed_date,
    NEW.start_time,
    NEW.end_time,
    'active',
    false,
    c.id
  )
  RETURNING * INTO booking_row;

  UPDATE public.challenge_schedules
  SET booking_id = booking_row.id, updated_at = now()
  WHERE id = NEW.id;

  -- Cancel other outstanding proposals
  UPDATE public.challenge_schedules
  SET status = 'cancelled', updated_at = now()
  WHERE challenge_id = NEW.challenge_id
    AND id <> NEW.id
    AND status = 'proposed';

  -- If the challenge is still pending, accepting a schedule implies acceptance.
  IF c.status = 'pending' THEN
    UPDATE public.challenges
    SET status = 'accepted', proposed_date = NEW.proposed_date, updated_at = now()
    WHERE id = c.id;
  ELSE
    UPDATE public.challenges
    SET proposed_date = NEW.proposed_date, updated_at = now()
    WHERE id = c.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS apply_accepted_challenge_schedule_trigger ON public.challenge_schedules;
CREATE TRIGGER apply_accepted_challenge_schedule_trigger
  AFTER UPDATE OF status ON public.challenge_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_accepted_challenge_schedule();

-- 5) Allow opponent to cancel a booking too (so either player can cancel/reschedule)
DROP POLICY IF EXISTS "Users can cancel own bookings" ON public.bookings;
CREATE POLICY "Users can cancel own bookings"
  ON public.bookings FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR auth.uid() = opponent_id);

-- 6) Maintenance: expire old challenges/schedules (called by cron/edge function)
CREATE OR REPLACE FUNCTION public.expire_old_challenges_and_schedules()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expired_challenges integer := 0;
  expired_schedules integer := 0;
BEGIN
  UPDATE public.challenges
  SET status = 'expired', updated_at = now()
  WHERE status IN ('pending','accepted')
    AND expires_at < now()
    AND NOT EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.challenge_id = public.challenges.id
        AND m.confirmed = true
    );
  GET DIAGNOSTICS expired_challenges = ROW_COUNT;

  UPDATE public.challenge_schedules
  SET status = 'expired', updated_at = now()
  WHERE status = 'proposed'
    AND expires_at < now();
  GET DIAGNOSTICS expired_schedules = ROW_COUNT;

  RETURN jsonb_build_object('expired_challenges', expired_challenges, 'expired_schedules', expired_schedules);
END;
$$;

REVOKE ALL ON FUNCTION public.expire_old_challenges_and_schedules() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.expire_old_challenges_and_schedules() TO authenticated;

