CREATE OR REPLACE FUNCTION public.apply_confirmed_match_effects()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  winner uuid; loser uuid;
  c_challenger uuid; c_opponent uuid;
  c_challenger_member_id uuid; c_opponent_member_id uuid;
  resolved_challenger_member_id uuid; resolved_opponent_member_id uuid;
  v_club_id uuid;
  v_movement text := 'insert';
  v_affects boolean := false;
  v_from_challenges boolean := true;
  v_challenger_won boolean := false;
BEGIN
  IF NEW.club_id = '061e6dd9-0ec2-4427-a939-3f18ad0884c8' AND (NEW.challenge_id IS NOT NULL OR NEW.source_type = 'ladder') THEN RETURN NEW; END IF;
  IF NEW.confirmed IS NOT TRUE OR OLD.confirmed IS TRUE THEN RETURN NEW; END IF;
  IF NEW.winner_id IS NULL AND NEW.winner_member_id IS NULL THEN
    RAISE EXCEPTION 'Cannot confirm a match without a winner';
  END IF;

  winner := NEW.winner_id;
  loser := CASE WHEN winner = NEW.player_a THEN NEW.player_b ELSE NEW.player_a END;

  IF winner IS NOT NULL AND loser IS NOT NULL AND winner <> loser THEN
    UPDATE public.profiles SET matches_played = matches_played + 1,
      wins = wins + CASE WHEN id = winner THEN 1 ELSE 0 END,
      losses = losses + CASE WHEN id = loser THEN 1 ELSE 0 END, updated_at = now()
    WHERE id IN (winner, loser);
  ELSIF winner IS NOT NULL THEN
    UPDATE public.profiles SET matches_played = matches_played + 1, wins = wins + 1, updated_at = now() WHERE id = winner;
  END IF;

  IF NEW.challenge_id IS NOT NULL THEN
    SELECT challenger_id, opponent_id, club_id, challenger_member_id, opponent_member_id
    INTO c_challenger, c_opponent, v_club_id, c_challenger_member_id, c_opponent_member_id
    FROM public.challenges WHERE id = NEW.challenge_id;
    IF v_club_id IS NULL THEN v_club_id := NEW.club_id; END IF;

    SELECT COALESCE(lc.movement_policy,'insert'), COALESCE(lc.affects_club_ranking,false), COALESCE(lc.ladder_from_challenges,true)
      INTO v_movement, v_affects, v_from_challenges
    FROM public.ladder_configs lc WHERE lc.club_id = v_club_id;
    v_movement := COALESCE(v_movement, 'insert');
    v_from_challenges := COALESCE(v_from_challenges, true);

    SELECT cm.id INTO resolved_challenger_member_id FROM public.club_members cm
    WHERE ((c_challenger IS NOT NULL AND cm.user_id = c_challenger) OR (c_challenger_member_id IS NOT NULL AND cm.id = c_challenger_member_id))
      AND (v_club_id IS NULL OR cm.club_id = v_club_id)
    ORDER BY cm.joined_at DESC LIMIT 1;

    SELECT cm.id INTO resolved_opponent_member_id FROM public.club_members cm
    WHERE ((c_opponent IS NOT NULL AND cm.user_id = c_opponent) OR (c_opponent_member_id IS NOT NULL AND cm.id = c_opponent_member_id))
      AND (v_club_id IS NULL OR cm.club_id = v_club_id)
    ORDER BY cm.joined_at DESC LIMIT 1;

    v_challenger_won := (winner IS NOT NULL AND winner = c_challenger)
      OR (NEW.winner_member_id IS NOT NULL AND NEW.winner_member_id = c_challenger_member_id);

    -- Ladder movement only when the challenger wins, via the shared source gate
    IF v_challenger_won AND v_from_challenges
       AND resolved_challenger_member_id IS NOT NULL AND resolved_opponent_member_id IS NOT NULL THEN
      PERFORM public.apply_ladder_result(v_club_id, resolved_challenger_member_id, resolved_opponent_member_id, v_movement, 'challenge', NEW.challenge_id);
    END IF;

    IF v_affects AND resolved_challenger_member_id IS NOT NULL AND resolved_opponent_member_id IS NOT NULL THEN
      PERFORM public.award_ranking_points_for_result(v_club_id,
        CASE WHEN v_challenger_won THEN resolved_challenger_member_id ELSE resolved_opponent_member_id END,
        CASE WHEN v_challenger_won THEN resolved_opponent_member_id ELSE resolved_challenger_member_id END,
        'challenge', NEW.challenge_id);
    END IF;

    UPDATE public.challenges SET status = 'completed', updated_at = now()
    WHERE id = NEW.challenge_id AND status <> 'completed';
  END IF;
  RETURN NEW;
END;
$$;