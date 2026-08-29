CREATE OR REPLACE FUNCTION public.apply_confirmed_match_effects()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  winner uuid;
  loser uuid;
  c_challenger uuid;
  c_opponent uuid;
  c_challenger_member_id uuid;
  c_opponent_member_id uuid;
  challenger_rank integer;
  opponent_rank integer;
  resolved_challenger_member_id uuid;
  resolved_opponent_member_id uuid;
  challenger_group text;
  opponent_group text;
  v_club_id uuid;
  v_movement text := 'insert';
  v_affects boolean := false;
  v_challenger_won boolean := false;
BEGIN
  IF NEW.confirmed IS NOT TRUE OR OLD.confirmed IS TRUE THEN
    RETURN NEW;
  END IF;

  IF NEW.winner_id IS NULL AND NEW.winner_member_id IS NULL THEN
    RAISE EXCEPTION 'Cannot confirm a match without a winner';
  END IF;

  winner := NEW.winner_id;
  loser := CASE WHEN winner = NEW.player_a THEN NEW.player_b ELSE NEW.player_a END;

  IF winner IS NOT NULL AND loser IS NOT NULL AND winner <> loser THEN
    UPDATE public.profiles
    SET
      matches_played = matches_played + 1,
      wins = wins + CASE WHEN id = winner THEN 1 ELSE 0 END,
      losses = losses + CASE WHEN id = loser THEN 1 ELSE 0 END,
      updated_at = now()
    WHERE id IN (winner, loser);
  ELSIF winner IS NOT NULL THEN
    UPDATE public.profiles
    SET matches_played = matches_played + 1, wins = wins + 1, updated_at = now()
    WHERE id = winner;
  END IF;

  IF NEW.challenge_id IS NOT NULL THEN
    SELECT challenger_id, opponent_id, club_id, challenger_member_id, opponent_member_id
    INTO c_challenger, c_opponent, v_club_id, c_challenger_member_id, c_opponent_member_id
    FROM public.challenges
    WHERE id = NEW.challenge_id;

    IF v_club_id IS NULL THEN
      v_club_id := NEW.club_id;
    END IF;

    SELECT COALESCE(lc.movement_policy,'insert'), COALESCE(lc.affects_club_ranking,false)
      INTO v_movement, v_affects
    FROM public.ladder_configs lc
    WHERE lc.club_id = v_club_id;
    v_movement := COALESCE(v_movement, 'insert');

    -- Resolve both club members regardless of who won
    SELECT cm.id, cm.ladder_position,
      CASE WHEN lower(COALESCE(cm.gender, '')) IN ('female', 'ladies', 'f') THEN 'ladies' ELSE 'men' END
    INTO resolved_challenger_member_id, challenger_rank, challenger_group
    FROM public.club_members cm
    WHERE (
      (c_challenger IS NOT NULL AND cm.user_id = c_challenger)
      OR (c_challenger_member_id IS NOT NULL AND cm.id = c_challenger_member_id)
    )
      AND (v_club_id IS NULL OR cm.club_id = v_club_id)
    ORDER BY cm.joined_at DESC
    LIMIT 1;

    SELECT cm.id, cm.ladder_position,
      CASE WHEN lower(COALESCE(cm.gender, '')) IN ('female', 'ladies', 'f') THEN 'ladies' ELSE 'men' END
    INTO resolved_opponent_member_id, opponent_rank, opponent_group
    FROM public.club_members cm
    WHERE (
      (c_opponent IS NOT NULL AND cm.user_id = c_opponent)
      OR (c_opponent_member_id IS NOT NULL AND cm.id = c_opponent_member_id)
    )
      AND (v_club_id IS NULL OR cm.club_id = v_club_id)
    ORDER BY cm.joined_at DESC
    LIMIT 1;

    v_challenger_won := (winner IS NOT NULL AND winner = c_challenger)
      OR (NEW.winner_member_id IS NOT NULL AND NEW.winner_member_id = c_challenger_member_id);

    -- Ladder movement only when the challenger (lower-ranked player) wins
    IF v_challenger_won THEN
      IF challenger_rank IS NOT NULL
         AND opponent_rank IS NOT NULL
         AND challenger_group = opponent_group
         AND challenger_rank > opponent_rank THEN

        IF v_movement = 'swap' THEN
          UPDATE public.club_members
          SET ladder_position = opponent_rank, updated_at = now()
          WHERE id = resolved_challenger_member_id;
          UPDATE public.club_members
          SET ladder_position = challenger_rank, updated_at = now()
          WHERE id = resolved_opponent_member_id;
        ELSE
          UPDATE public.club_members cm
          SET ladder_position = cm.ladder_position + 1,
              updated_at = now()
          WHERE (v_club_id IS NULL OR cm.club_id = v_club_id)
            AND (
              (challenger_group = 'ladies' AND lower(COALESCE(cm.gender, '')) IN ('female', 'ladies', 'f'))
              OR
              (challenger_group = 'men' AND lower(COALESCE(cm.gender, '')) NOT IN ('female', 'ladies', 'f'))
            )
            AND cm.ladder_position IS NOT NULL
            AND cm.ladder_position >= opponent_rank
            AND cm.ladder_position < challenger_rank
            AND cm.id <> resolved_challenger_member_id;

          UPDATE public.club_members
          SET ladder_position = opponent_rank,
              updated_at = now()
          WHERE id = resolved_challenger_member_id;
        END IF;
      END IF;
    END IF;

    -- Ranking points (opt-in per club)
    IF v_affects
       AND resolved_challenger_member_id IS NOT NULL
       AND resolved_opponent_member_id IS NOT NULL THEN
      PERFORM public.award_ranking_points_for_result(
        v_club_id,
        CASE WHEN v_challenger_won THEN resolved_challenger_member_id ELSE resolved_opponent_member_id END,
        CASE WHEN v_challenger_won THEN resolved_opponent_member_id ELSE resolved_challenger_member_id END,
        'challenge',
        NEW.challenge_id
      );
    END IF;

    UPDATE public.challenges
    SET status = 'completed', updated_at = now()
    WHERE id = NEW.challenge_id
      AND status <> 'completed';
  END IF;

  RETURN NEW;
END;
$function$;