
-- 1. Update handle_new_user: stop assigning profiles.rank on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, name, email, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    NEW.email,
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'phone', '')), '')
  );

  -- Auto-link any pre-registered club memberships
  UPDATE public.club_members
  SET user_id = NEW.id
  WHERE email = NEW.email
    AND user_id IS NULL;

  RETURN NEW;
END;
$function$;

-- 2. Update validate_challenge_insert: use member_league_registrations.player_rank
CREATE OR REPLACE FUNCTION public.validate_challenge_insert()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  challenger_rank integer;
  opponent_rank integer;
  existing_id uuid;
  max_levels integer;
  v_club_id uuid;
BEGIN
  IF NEW.challenger_id = NEW.opponent_id THEN
    RAISE EXCEPTION 'You cannot challenge yourself';
  END IF;

  -- Get club_id from the challenge or from the challenger's membership
  v_club_id := NEW.club_id;
  IF v_club_id IS NULL THEN
    SELECT cm.club_id INTO v_club_id
    FROM public.club_members cm
    WHERE cm.user_id = NEW.challenger_id
    ORDER BY cm.joined_at DESC LIMIT 1;
  END IF;

  -- Get ladder ranks from member_league_registrations via club_members
  SELECT mlr.player_rank INTO challenger_rank
  FROM public.club_members cm
  JOIN public.member_league_registrations mlr ON mlr.club_member_id = cm.id
  WHERE cm.user_id = NEW.challenger_id
    AND (v_club_id IS NULL OR cm.club_id = v_club_id)
    AND mlr.player_rank IS NOT NULL
  ORDER BY mlr.player_rank ASC
  LIMIT 1;

  SELECT mlr.player_rank INTO opponent_rank
  FROM public.club_members cm
  JOIN public.member_league_registrations mlr ON mlr.club_member_id = cm.id
  WHERE cm.user_id = NEW.opponent_id
    AND (v_club_id IS NULL OR cm.club_id = v_club_id)
    AND mlr.player_rank IS NOT NULL
  ORDER BY mlr.player_rank ASC
  LIMIT 1;

  IF challenger_rank IS NULL OR opponent_rank IS NULL THEN
    RAISE EXCEPTION 'Both players must have a ladder rank';
  END IF;

  IF challenger_rank <= opponent_rank THEN
    RAISE EXCEPTION 'You may only challenge players above you';
  END IF;

  -- Get the club's challenge_levels_up setting (fall back to 2)
  SELECT COALESCE(c.challenge_levels_up, 2) INTO max_levels
  FROM public.clubs c
  WHERE c.id = v_club_id;

  IF max_levels IS NULL THEN
    max_levels := 2;
  END IF;

  IF (challenger_rank - opponent_rank) > max_levels THEN
    RAISE EXCEPTION 'You may challenge up to % positions above you', max_levels;
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
$function$;

-- 3. Update apply_confirmed_match_effects: swap ladder ranks in member_league_registrations
CREATE OR REPLACE FUNCTION public.apply_confirmed_match_effects()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  winner uuid;
  loser uuid;
  c_challenger uuid;
  c_opponent uuid;
  challenger_rank integer;
  opponent_rank integer;
  challenger_member_id uuid;
  opponent_member_id uuid;
  challenger_reg_id uuid;
  opponent_reg_id uuid;
  v_club_id uuid;
BEGIN
  IF NEW.confirmed IS NOT TRUE OR OLD.confirmed IS TRUE THEN
    RETURN NEW;
  END IF;

  IF NEW.winner_id IS NULL THEN
    RAISE EXCEPTION 'Cannot confirm a match without a winner';
  END IF;

  winner := NEW.winner_id;
  loser := CASE WHEN winner = NEW.player_a THEN NEW.player_b ELSE NEW.player_a END;

  -- Update player stats
  UPDATE public.profiles
  SET
    matches_played = matches_played + 1,
    wins = wins + CASE WHEN id = winner THEN 1 ELSE 0 END,
    losses = losses + CASE WHEN id = loser THEN 1 ELSE 0 END,
    updated_at = now()
  WHERE id IN (winner, loser);

  -- If linked to a challenge, apply ladder movement (challenger wins → swap positions)
  IF NEW.challenge_id IS NOT NULL THEN
    SELECT challenger_id, opponent_id, club_id
    INTO c_challenger, c_opponent, v_club_id
    FROM public.challenges
    WHERE id = NEW.challenge_id;

    IF v_club_id IS NULL THEN
      v_club_id := NEW.club_id;
    END IF;

    IF FOUND AND winner = c_challenger THEN
      -- Get challenger's ladder rank
      SELECT cm.id, mlr.id, mlr.player_rank
      INTO challenger_member_id, challenger_reg_id, challenger_rank
      FROM public.club_members cm
      JOIN public.member_league_registrations mlr ON mlr.club_member_id = cm.id
      WHERE cm.user_id = c_challenger
        AND (v_club_id IS NULL OR cm.club_id = v_club_id)
        AND mlr.player_rank IS NOT NULL
      ORDER BY mlr.player_rank ASC LIMIT 1;

      -- Get opponent's ladder rank
      SELECT cm.id, mlr.id, mlr.player_rank
      INTO opponent_member_id, opponent_reg_id, opponent_rank
      FROM public.club_members cm
      JOIN public.member_league_registrations mlr ON mlr.club_member_id = cm.id
      WHERE cm.user_id = c_opponent
        AND (v_club_id IS NULL OR cm.club_id = v_club_id)
        AND mlr.player_rank IS NOT NULL
      ORDER BY mlr.player_rank ASC LIMIT 1;

      IF challenger_rank IS NOT NULL AND opponent_rank IS NOT NULL AND challenger_rank > opponent_rank THEN
        -- Shift everyone between opponent_rank and challenger_rank-1 down by 1
        UPDATE public.member_league_registrations mlr
        SET player_rank = mlr.player_rank + 1, updated_at = now()
        FROM public.club_members cm
        WHERE mlr.club_member_id = cm.id
          AND (v_club_id IS NULL OR cm.club_id = v_club_id)
          AND mlr.player_rank >= opponent_rank
          AND mlr.player_rank < challenger_rank
          AND mlr.id <> challenger_reg_id;

        -- Move challenger to opponent's old position
        UPDATE public.member_league_registrations
        SET player_rank = opponent_rank, updated_at = now()
        WHERE id = challenger_reg_id;
      END IF;
    END IF;

    UPDATE public.challenges
    SET status = 'completed', updated_at = now()
    WHERE id = NEW.challenge_id
      AND status <> 'completed';
  END IF;

  RETURN NEW;
END;
$function$;

-- 4. Update admin_reorder_ladder: only update member_league_registrations, not profiles.rank
CREATE OR REPLACE FUNCTION public.admin_reorder_ladder(player_ids uuid[], gender_filter text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  i integer;
  pid uuid;
  club_member_record record;
BEGIN
  -- Verify caller is admin or club admin
  IF NOT has_role(auth.uid(), 'admin') THEN
    -- Check if club admin
    SELECT cm.id, cm.club_id INTO club_member_record
    FROM public.club_members cm
    WHERE (cm.user_id = player_ids[1] OR cm.id = player_ids[1])
    LIMIT 1;
    
    IF club_member_record.club_id IS NULL OR NOT is_club_admin(auth.uid(), club_member_record.club_id) THEN
      RAISE EXCEPTION 'Only admins can reorder the ladder';
    END IF;
  END IF;

  FOR i IN 1..array_length(player_ids, 1) LOOP
    pid := player_ids[i];
    
    SELECT id INTO club_member_record
    FROM public.club_members
    WHERE (user_id = pid OR id = pid)
    LIMIT 1;

    IF club_member_record.id IS NOT NULL THEN
      -- Update all league registrations for this member with new rank
      UPDATE public.member_league_registrations
      SET player_rank = i, updated_at = now()
      WHERE club_member_id = club_member_record.id;
    END IF;
  END LOOP;
END;
$function$;
