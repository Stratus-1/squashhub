-- Lock down dispute note/evidence edits so only the disputing user (or admin) can change them while disputed.

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

  -- While disputed, only the disputing user may edit dispute notes/evidence.
  IF OLD.disputed IS TRUE AND NEW.disputed IS TRUE THEN
    IF (NEW.dispute_notes IS DISTINCT FROM OLD.dispute_notes OR NEW.dispute_evidence_url IS DISTINCT FROM OLD.dispute_evidence_url)
       AND uid IS DISTINCT FROM OLD.disputed_by
    THEN
      RAISE EXCEPTION 'Only the disputing user can edit dispute notes/evidence';
    END IF;
  END IF;

  IF NEW.disputed IS TRUE THEN
    IF NEW.confirmed IS TRUE THEN
      RAISE EXCEPTION 'Cannot confirm a disputed match';
    END IF;
  ELSE
    -- If not disputing, you cannot add dispute notes/evidence.
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

