-- Match confirmation workflow + disputes + friendly match protection + player form/inactivity fields.
--
-- Goals:
-- - Require both players to confirm before a match becomes `confirmed=true`
-- - Allow admins/moderators to confirm directly
-- - Provide a dispute workflow with notes/evidence
-- - Ensure friendly matches never affect ladder movement or profile stats
-- - Track "form" (last 5) + last competitive match time

-- 1) Schema extensions
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_friendly boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS confirm_a boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS confirm_b boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS confirmed_by_admin boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS disputed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS disputed_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispute_notes text,
  ADD COLUMN IF NOT EXISTS dispute_evidence_url text;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS form_last5 text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS last_competitive_match_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'matches_friendly_no_challenge'
  ) THEN
    ALTER TABLE public.matches
      ADD CONSTRAINT matches_friendly_no_challenge
      CHECK (NOT is_friendly OR challenge_id IS NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_form_last5_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_form_last5_check
      CHECK (form_last5 ~ '^[WL]{0,5}$');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS matches_booking_id_idx ON public.matches(booking_id);
CREATE INDEX IF NOT EXISTS matches_confirmed_competitive_idx ON public.matches(match_date DESC, created_at DESC)
  WHERE confirmed = true AND is_friendly = false;

-- 2) Helpers: recompute player form (last 5 competitive confirmed matches)
CREATE OR REPLACE FUNCTION public.recompute_profile_form_last5(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  f text;
BEGIN
  SELECT string_agg(res, '' ORDER BY ord) INTO f
  FROM (
    SELECT
      CASE WHEN m.winner_id = target_user_id THEN 'W' ELSE 'L' END AS res,
      row_number() OVER (ORDER BY m.match_date DESC, m.created_at DESC) AS ord
    FROM public.matches m
    WHERE m.confirmed = true
      AND COALESCE(m.is_friendly, false) = false
      AND (m.player_a = target_user_id OR m.player_b = target_user_id)
    ORDER BY m.match_date DESC, m.created_at DESC
    LIMIT 5
  ) t;

  UPDATE public.profiles
  SET
    form_last5 = COALESCE(f, ''),
    last_competitive_match_at = now(),
    updated_at = now()
  WHERE id = target_user_id;
END;
$$;

-- 3) Prepare match insert: derive friendly flag, auto-confirm submitter
CREATE OR REPLACE FUNCTION public.prepare_match_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  booking_friendly boolean;
BEGIN
  -- If linked to a challenge, this is a ladder/competitive match.
  IF NEW.challenge_id IS NOT NULL THEN
    NEW.is_friendly := false;
  END IF;

  -- If linked to a booking, align friendliness from the booking.
  IF NEW.booking_id IS NOT NULL THEN
    SELECT is_friendly INTO booking_friendly
    FROM public.bookings
    WHERE id = NEW.booking_id;

    IF FOUND THEN
      NEW.is_friendly := COALESCE(booking_friendly, false);
    END IF;
  END IF;

  -- submitted_by (if present) must be a participant.
  IF NEW.submitted_by IS NOT NULL AND NEW.submitted_by NOT IN (NEW.player_a, NEW.player_b) THEN
    RAISE EXCEPTION 'submitted_by must be one of the match players';
  END IF;

  -- Auto-confirm the submitter (they are effectively confirming what they submitted).
  IF NEW.submitted_by IS NOT NULL THEN
    IF NEW.submitted_by = NEW.player_a THEN
      NEW.confirm_a := true;
    ELSIF NEW.submitted_by = NEW.player_b THEN
      NEW.confirm_b := true;
    END IF;
  END IF;

  -- Normalize confirmation metadata fields on insert.
  NEW.confirmed_by_admin := COALESCE(NEW.confirmed_by_admin, false);
  IF NEW.confirmed IS TRUE THEN
    NEW.confirmed_at := COALESCE(NEW.confirmed_at, now());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prepare_match_insert_trigger ON public.matches;
CREATE TRIGGER prepare_match_insert_trigger
  BEFORE INSERT ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION public.prepare_match_insert();

-- 4) Validate match updates: enforce two-party confirmation and dispute workflow
CREATE OR REPLACE FUNCTION public.validate_match_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
  is_admin boolean := false;
BEGIN
  uid := auth.uid();
  is_admin := uid IS NOT NULL AND public.is_admin_or_moderator(uid);

  IF is_admin THEN
    IF NEW.confirmed IS TRUE AND OLD.confirmed IS DISTINCT FROM TRUE THEN
      NEW.confirmed_at := COALESCE(NEW.confirmed_at, now());
      NEW.confirmed_by_admin := COALESCE(NEW.confirmed_by_admin, false);
    END IF;
    RETURN NEW;
  END IF;

  IF uid IS NULL OR (uid <> OLD.player_a AND uid <> OLD.player_b) THEN
    RAISE EXCEPTION 'Not authorized to update this match';
  END IF;

  -- Participants cannot change match core fields after insert.
  IF NEW.player_a IS DISTINCT FROM OLD.player_a
     OR NEW.player_b IS DISTINCT FROM OLD.player_b
     OR NEW.winner_id IS DISTINCT FROM OLD.winner_id
     OR NEW.score IS DISTINCT FROM OLD.score
     OR NEW.game_scores IS DISTINCT FROM OLD.game_scores
     OR NEW.challenge_id IS DISTINCT FROM OLD.challenge_id
     OR NEW.court_id IS DISTINCT FROM OLD.court_id
     OR NEW.match_date IS DISTINCT FROM OLD.match_date
     OR NEW.submitted_by IS DISTINCT FROM OLD.submitted_by
     OR NEW.is_friendly IS DISTINCT FROM OLD.is_friendly
     OR NEW.booking_id IS DISTINCT FROM OLD.booking_id
  THEN
    RAISE EXCEPTION 'Match details cannot be edited by players after submission';
  END IF;

  -- Dispute rules
  IF OLD.confirmed IS TRUE AND NEW.disputed IS TRUE THEN
    RAISE EXCEPTION 'Cannot dispute a confirmed match';
  END IF;

  IF NEW.disputed IS DISTINCT FROM OLD.disputed THEN
    IF NEW.disputed IS TRUE THEN
      NEW.disputed_by := uid;
      NEW.disputed_at := now();
      -- Reset confirmations when disputed to force a clean resolution.
      NEW.confirm_a := false;
      NEW.confirm_b := false;
    ELSE
      RAISE EXCEPTION 'Only admins can clear disputes';
    END IF;
  END IF;

  IF NEW.disputed IS TRUE THEN
    -- While disputed, you may update notes/evidence (but cannot confirm).
    IF NEW.confirmed IS TRUE THEN
      RAISE EXCEPTION 'Cannot confirm a disputed match';
    END IF;
  ELSE
    -- If not disputed, players can still update dispute_notes/evidence (e.g. clear text) only if they are the disputer.
    IF (NEW.dispute_notes IS DISTINCT FROM OLD.dispute_notes OR NEW.dispute_evidence_url IS DISTINCT FROM OLD.dispute_evidence_url)
       AND OLD.disputed IS NOT TRUE
    THEN
      RAISE EXCEPTION 'Dispute notes can only be added when disputing';
    END IF;
  END IF;

  -- Confirmation flags: only allow toggling your own flag from false -> true.
  IF uid = OLD.player_a THEN
    IF NEW.confirm_b IS DISTINCT FROM OLD.confirm_b THEN
      RAISE EXCEPTION 'Cannot modify opponent confirmation';
    END IF;
    IF OLD.confirm_a IS TRUE AND NEW.confirm_a IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'Cannot remove your confirmation';
    END IF;
  ELSE
    IF NEW.confirm_a IS DISTINCT FROM OLD.confirm_a THEN
      RAISE EXCEPTION 'Cannot modify opponent confirmation';
    END IF;
    IF OLD.confirm_b IS TRUE AND NEW.confirm_b IS DISTINCT FROM TRUE THEN
      RAISE EXCEPTION 'Cannot remove your confirmation';
    END IF;
  END IF;

  -- Prevent direct confirmation toggles; confirmation becomes true only when both players confirmed.
  IF NEW.confirmed IS DISTINCT FROM OLD.confirmed THEN
    IF NEW.confirmed IS TRUE THEN
      IF NEW.disputed IS TRUE THEN
        RAISE EXCEPTION 'Cannot confirm a disputed match';
      END IF;
      IF NOT (NEW.confirm_a AND NEW.confirm_b) THEN
        RAISE EXCEPTION 'Both players must confirm the match';
      END IF;
      NEW.confirmed_at := now();
    ELSE
      RAISE EXCEPTION 'Cannot unconfirm a match';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_match_update_trigger ON public.matches;
CREATE TRIGGER validate_match_update_trigger
  BEFORE UPDATE ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_match_update();

-- 5) RPCs for confirmation/dispute flows
CREATE OR REPLACE FUNCTION public.confirm_match(match_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
  a uuid;
  b uuid;
  ca boolean;
  cb boolean;
  is_disputed boolean;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT player_a, player_b, confirm_a, confirm_b, disputed
  INTO a, b, ca, cb, is_disputed
  FROM public.matches
  WHERE id = match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  IF is_disputed IS TRUE THEN
    RAISE EXCEPTION 'This match is disputed';
  END IF;

  IF uid <> a AND uid <> b THEN
    RAISE EXCEPTION 'Only participants can confirm this match';
  END IF;

  IF uid = a THEN
    IF ca IS NOT TRUE THEN
      UPDATE public.matches SET confirm_a = true WHERE id = match_id;
    END IF;
  ELSE
    IF cb IS NOT TRUE THEN
      UPDATE public.matches SET confirm_b = true WHERE id = match_id;
    END IF;
  END IF;

  -- Confirm only when both flags are true.
  UPDATE public.matches
  SET confirmed = true
  WHERE id = match_id
    AND confirmed IS NOT TRUE
    AND disputed IS NOT TRUE
    AND confirm_a IS TRUE
    AND confirm_b IS TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_match(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confirm_match(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.dispute_match(match_id uuid, notes text DEFAULT NULL, evidence_url text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
  a uuid;
  b uuid;
BEGIN
  uid := auth.uid();
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT player_a, player_b INTO a, b
  FROM public.matches
  WHERE id = match_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Match not found';
  END IF;

  IF uid <> a AND uid <> b THEN
    RAISE EXCEPTION 'Only participants can dispute this match';
  END IF;

  UPDATE public.matches
  SET
    disputed = true,
    dispute_notes = NULLIF(trim(COALESCE(notes, '')), ''),
    dispute_evidence_url = NULLIF(trim(COALESCE(evidence_url, '')), '')
  WHERE id = match_id
    AND confirmed IS NOT TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.dispute_match(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dispute_match(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_confirm_match(match_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
BEGIN
  uid := auth.uid();
  IF uid IS NULL OR NOT public.is_admin_or_moderator(uid) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  UPDATE public.matches
  SET
    confirm_a = true,
    confirm_b = true,
    disputed = false,
    disputed_by = NULL,
    disputed_at = NULL,
    dispute_notes = NULL,
    dispute_evidence_url = NULL,
    confirmed_by_admin = true,
    confirmed = true,
    confirmed_at = now()
  WHERE id = match_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_confirm_match(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_confirm_match(uuid) TO authenticated;

-- 6) Apply effects on confirmed match (ignore friendly matches)
CREATE OR REPLACE FUNCTION public.apply_confirmed_match_effects()
RETURNS TRIGGER AS $$
DECLARE
  winner uuid;
  loser uuid;
  c_challenger uuid;
  c_opponent uuid;
  challenger_rank integer;
  opponent_rank integer;
  affected jsonb;
  item jsonb;
  pid uuid;
  prank integer;
BEGIN
  IF NEW.confirmed IS NOT TRUE OR OLD.confirmed IS TRUE THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.is_friendly, false) IS TRUE THEN
    -- Friendly matches never affect ladder or profile stats.
    RETURN NEW;
  END IF;

  IF NEW.winner_id IS NULL THEN
    RAISE EXCEPTION 'Cannot confirm a match without a winner';
  END IF;

  winner := NEW.winner_id;
  loser := CASE WHEN winner = NEW.player_a THEN NEW.player_b ELSE NEW.player_a END;

  -- Update player stats (once, on confirmation)
  UPDATE public.profiles
  SET
    matches_played = matches_played + 1,
    wins = wins + CASE WHEN id = winner THEN 1 ELSE 0 END,
    losses = losses + CASE WHEN id = loser THEN 1 ELSE 0 END,
    updated_at = now()
  WHERE id IN (winner, loser);

  -- Update form + last match time
  PERFORM public.recompute_profile_form_last5(winner);
  PERFORM public.recompute_profile_form_last5(loser);

  -- If this match is linked to a challenge, apply ladder movement (challenger wins only)
  IF NEW.challenge_id IS NOT NULL THEN
    SELECT challenger_id, opponent_id
    INTO c_challenger, c_opponent
    FROM public.challenges
    WHERE id = NEW.challenge_id;

    IF FOUND AND winner = c_challenger THEN
      PERFORM pg_advisory_xact_lock(923402);

      SELECT rank INTO challenger_rank FROM public.profiles WHERE id = c_challenger;
      SELECT rank INTO opponent_rank FROM public.profiles WHERE id = c_opponent;

      IF challenger_rank IS NULL OR opponent_rank IS NULL THEN
        RAISE EXCEPTION 'Both players must have a ladder rank for ladder movement';
      END IF;

      IF challenger_rank > opponent_rank THEN
        -- Snapshot the affected segment (unique ranks 1..20), then clear ranks to NULL to avoid unique collisions.
        SELECT jsonb_agg(
          jsonb_build_object('id', id, 'rank', rank)
          ORDER BY rank
        )
        INTO affected
        FROM public.profiles
        WHERE rank BETWEEN opponent_rank AND challenger_rank;

        UPDATE public.profiles
        SET rank = NULL, updated_at = now()
        WHERE rank BETWEEN opponent_rank AND challenger_rank;

        FOR item IN SELECT * FROM jsonb_array_elements(COALESCE(affected, '[]'::jsonb)) LOOP
          pid := (item->>'id')::uuid;
          prank := (item->>'rank')::integer;

          IF pid = c_challenger THEN
            UPDATE public.profiles
            SET rank = opponent_rank, updated_at = now()
            WHERE id = pid;
          ELSE
            UPDATE public.profiles
            SET rank = prank + 1, updated_at = now()
            WHERE id = pid;
          END IF;
        END LOOP;
      END IF;
    END IF;

    UPDATE public.challenges
    SET status = 'completed', updated_at = now()
    WHERE id = NEW.challenge_id
      AND status <> 'completed';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

