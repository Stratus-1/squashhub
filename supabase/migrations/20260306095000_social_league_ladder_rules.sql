-- Social League Ladder rules (positions 1–20)
-- - Challenge only up to 2 ranks above
-- - Ladder movement on confirmed match: challenger takes opponent rank if challenger wins
-- - Stats update on confirmed match

-- 1) Ladder rank constraints / indexes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'profiles_rank_range'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_rank_range
      CHECK (rank IS NULL OR (rank BETWEEN 1 AND 20));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_unique_rank
  ON public.profiles(rank)
  WHERE rank IS NOT NULL;

-- Ensure only one match per challenge
CREATE UNIQUE INDEX IF NOT EXISTS matches_unique_challenge_id
  ON public.matches(challenge_id)
  WHERE challenge_id IS NOT NULL;

-- 2) Auto-assign new users to the bottom of the ladder (if space)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  next_rank integer;
BEGIN
  -- serialize rank assignment to avoid duplicates
  PERFORM pg_advisory_xact_lock(923401);

  SELECT (COALESCE(MAX(rank), 0) + 1)
  INTO next_rank
  FROM public.profiles
  WHERE rank IS NOT NULL;

  IF next_rank > 20 THEN
    next_rank := NULL;
  END IF;

  INSERT INTO public.profiles (id, name, email, rank)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    NEW.email,
    next_rank
  );

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 3) Challenge validation (rank rules + transitions)
CREATE OR REPLACE FUNCTION public.validate_challenge_insert()
RETURNS TRIGGER AS $$
DECLARE
  challenger_rank integer;
  opponent_rank integer;
  existing_id uuid;
BEGIN
  IF NEW.challenger_id = NEW.opponent_id THEN
    RAISE EXCEPTION 'You cannot challenge yourself';
  END IF;

  SELECT rank INTO challenger_rank
  FROM public.profiles
  WHERE id = NEW.challenger_id;

  SELECT rank INTO opponent_rank
  FROM public.profiles
  WHERE id = NEW.opponent_id;

  IF challenger_rank IS NULL OR opponent_rank IS NULL THEN
    RAISE EXCEPTION 'Both players must have a ladder rank';
  END IF;

  IF challenger_rank <= opponent_rank THEN
    RAISE EXCEPTION 'You may only challenge players above you';
  END IF;

  IF (challenger_rank - opponent_rank) > 2 THEN
    RAISE EXCEPTION 'You may challenge up to 2 positions above you';
  END IF;

  SELECT id INTO existing_id
  FROM public.challenges
  WHERE status IN ('pending', 'accepted')
    AND (
      (challenger_id = NEW.challenger_id AND opponent_id = NEW.opponent_id)
      OR
      (challenger_id = NEW.opponent_id AND opponent_id = NEW.challenger_id)
    )
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'An active challenge already exists between these players';
  END IF;

  NEW.status := COALESCE(NEW.status, 'pending');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_challenge_insert_trigger ON public.challenges;
CREATE TRIGGER validate_challenge_insert_trigger
  BEFORE INSERT ON public.challenges
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_challenge_insert();

CREATE OR REPLACE FUNCTION public.validate_challenge_update()
RETURNS TRIGGER AS $$
DECLARE
  uid uuid;
  match_confirmed boolean;
BEGIN
  uid := auth.uid();

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

DROP TRIGGER IF EXISTS validate_challenge_update_trigger ON public.challenges;
CREATE TRIGGER validate_challenge_update_trigger
  BEFORE UPDATE ON public.challenges
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_challenge_update();

-- 4) Match validation + ladder movement on confirmation
CREATE OR REPLACE FUNCTION public.validate_match_insert()
RETURNS TRIGGER AS $$
DECLARE
  c_challenger uuid;
  c_opponent uuid;
  c_status text;
BEGIN
  IF NEW.winner_id IS NOT NULL AND NEW.winner_id NOT IN (NEW.player_a, NEW.player_b) THEN
    RAISE EXCEPTION 'Winner must be one of the players';
  END IF;

  IF NEW.challenge_id IS NOT NULL THEN
    SELECT challenger_id, opponent_id, status
    INTO c_challenger, c_opponent, c_status
    FROM public.challenges
    WHERE id = NEW.challenge_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Invalid challenge_id';
    END IF;

    IF c_status <> 'accepted' THEN
      RAISE EXCEPTION 'Challenge must be accepted before recording a match';
    END IF;

    IF NOT (
      (NEW.player_a = c_challenger AND NEW.player_b = c_opponent)
      OR
      (NEW.player_a = c_opponent AND NEW.player_b = c_challenger)
    ) THEN
      RAISE EXCEPTION 'Match players must match the challenge participants';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_match_insert_trigger ON public.matches;
CREATE TRIGGER validate_match_insert_trigger
  BEFORE INSERT ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_match_insert();

CREATE OR REPLACE FUNCTION public.apply_confirmed_match_effects()
RETURNS TRIGGER AS $$
DECLARE
  winner uuid;
  loser uuid;
  c_challenger uuid;
  c_opponent uuid;
  challenger_rank integer;
  opponent_rank integer;
BEGIN
  IF NEW.confirmed IS NOT TRUE OR OLD.confirmed IS TRUE THEN
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

  -- If this match is linked to a challenge, apply ladder movement (challenger wins only)
  IF NEW.challenge_id IS NOT NULL THEN
    SELECT challenger_id, opponent_id
    INTO c_challenger, c_opponent
    FROM public.challenges
    WHERE id = NEW.challenge_id;

    IF FOUND AND winner = c_challenger THEN
      SELECT rank INTO challenger_rank FROM public.profiles WHERE id = c_challenger;
      SELECT rank INTO opponent_rank FROM public.profiles WHERE id = c_opponent;

      IF challenger_rank IS NULL OR opponent_rank IS NULL THEN
        RAISE EXCEPTION 'Both players must have a ladder rank for ladder movement';
      END IF;

      IF challenger_rank > opponent_rank THEN
        UPDATE public.profiles
        SET
          rank = CASE
            WHEN id = c_challenger THEN opponent_rank
            WHEN rank BETWEEN opponent_rank AND challenger_rank - 1 THEN rank + 1
            ELSE rank
          END,
          updated_at = now()
        WHERE id = c_challenger OR (rank BETWEEN opponent_rank AND challenger_rank - 1);
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

DROP TRIGGER IF EXISTS apply_confirmed_match_effects_trigger ON public.matches;
CREATE TRIGGER apply_confirmed_match_effects_trigger
  AFTER UPDATE OF confirmed ON public.matches
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_confirmed_match_effects();

