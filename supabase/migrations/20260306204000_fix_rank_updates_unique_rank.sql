-- Fix ladder rank updates to avoid "profiles_unique_rank" violations
-- - Uses deterministic step-by-step rank shifting (no out-of-range temp ranks)
-- - Serializes all ladder rank edits with an advisory lock

-- 1) Replace admin_set_rank() with a constraint-safe implementation
CREATE OR REPLACE FUNCTION public.admin_set_rank(target_user_id uuid, new_rank integer)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
  current_rank integer;
  r integer;
BEGIN
  uid := auth.uid();
  IF uid IS NULL OR NOT public.is_admin_or_moderator(uid) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF new_rank IS NOT NULL AND (new_rank < 1 OR new_rank > 20) THEN
    RAISE EXCEPTION 'new_rank must be between 1 and 20 (or null)';
  END IF;

  PERFORM pg_advisory_xact_lock(923402);

  SELECT rank INTO current_rank
  FROM public.profiles
  WHERE id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF current_rank IS NOT DISTINCT FROM new_rank THEN
    RETURN;
  END IF;

  -- Remove from ladder
  IF new_rank IS NULL THEN
    IF current_rank IS NULL THEN
      RETURN;
    END IF;

    UPDATE public.profiles
    SET rank = NULL, updated_at = now()
    WHERE id = target_user_id;

    FOR r IN (current_rank + 1)..20 LOOP
      UPDATE public.profiles
      SET rank = r - 1, updated_at = now()
      WHERE rank = r;
    END LOOP;

    RETURN;
  END IF;

  -- Insert from unranked
  IF current_rank IS NULL THEN
    -- Drop off rank 20 if occupied
    UPDATE public.profiles
    SET rank = NULL, updated_at = now()
    WHERE rank = 20;

    FOR r IN REVERSE new_rank..19 LOOP
      UPDATE public.profiles
      SET rank = r + 1, updated_at = now()
      WHERE rank = r;
    END LOOP;

    UPDATE public.profiles
    SET rank = new_rank, updated_at = now()
    WHERE id = target_user_id;

    RETURN;
  END IF;

  -- Move within ladder
  UPDATE public.profiles
  SET rank = NULL, updated_at = now()
  WHERE id = target_user_id;

  IF new_rank < current_rank THEN
    -- Move up: shift down players in [new_rank..current_rank-1]
    FOR r IN REVERSE new_rank..(current_rank - 1) LOOP
      UPDATE public.profiles
      SET rank = r + 1, updated_at = now()
      WHERE rank = r;
    END LOOP;
  ELSE
    -- Move down: shift up players in [current_rank+1..new_rank]
    FOR r IN (current_rank + 1)..new_rank LOOP
      UPDATE public.profiles
      SET rank = r - 1, updated_at = now()
      WHERE rank = r;
    END LOOP;
  END IF;

  UPDATE public.profiles
  SET rank = new_rank, updated_at = now()
  WHERE id = target_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_rank(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_set_rank(uuid, integer) TO authenticated;

-- 2) Replace apply_confirmed_match_effects() ladder movement logic (challenge wins only)
CREATE OR REPLACE FUNCTION public.apply_confirmed_match_effects()
RETURNS TRIGGER AS $$
DECLARE
  winner uuid;
  loser uuid;
  c_challenger uuid;
  c_opponent uuid;
  challenger_rank integer;
  opponent_rank integer;
  r integer;
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
      -- serialize ladder updates to avoid concurrent collisions
      PERFORM pg_advisory_xact_lock(923402);

      SELECT rank INTO challenger_rank FROM public.profiles WHERE id = c_challenger;
      SELECT rank INTO opponent_rank FROM public.profiles WHERE id = c_opponent;

      IF challenger_rank IS NULL OR opponent_rank IS NULL THEN
        RAISE EXCEPTION 'Both players must have a ladder rank for ladder movement';
      END IF;

      IF challenger_rank > opponent_rank THEN
        -- Move challenger to opponent rank; shift others down by 1.
        UPDATE public.profiles
        SET rank = NULL, updated_at = now()
        WHERE id = c_challenger;

        FOR r IN REVERSE opponent_rank..(challenger_rank - 1) LOOP
          UPDATE public.profiles
          SET rank = r + 1, updated_at = now()
          WHERE rank = r;
        END LOOP;

        UPDATE public.profiles
        SET rank = opponent_rank, updated_at = now()
        WHERE id = c_challenger;
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

