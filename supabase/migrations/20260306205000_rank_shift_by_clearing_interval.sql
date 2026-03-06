-- Further harden ladder rank shifting to avoid unique-rank collisions
-- Strategy: snapshot affected ranks, clear them to NULL, then re-assign.

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

