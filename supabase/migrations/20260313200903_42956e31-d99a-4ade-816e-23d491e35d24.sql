-- Make club_members.league_player_rank the single source of truth for ladder ranking

-- 1) Challenge validation uses ladder rank from club_members
CREATE OR REPLACE FUNCTION public.validate_challenge_insert()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  challenger_rank integer;
  opponent_rank integer;
  challenger_group text;
  opponent_group text;
  existing_id uuid;
  max_levels integer;
  v_club_id uuid;
BEGIN
  IF NEW.challenger_id = NEW.opponent_id THEN
    RAISE EXCEPTION 'You cannot challenge yourself';
  END IF;

  v_club_id := NEW.club_id;
  IF v_club_id IS NULL THEN
    SELECT cm.club_id INTO v_club_id
    FROM public.club_members cm
    WHERE cm.user_id = NEW.challenger_id
    ORDER BY cm.joined_at DESC
    LIMIT 1;
  END IF;

  SELECT
    cm.league_player_rank,
    CASE
      WHEN lower(COALESCE(cm.gender, '')) IN ('female', 'ladies', 'f') THEN 'ladies'
      ELSE 'men'
    END
  INTO challenger_rank, challenger_group
  FROM public.club_members cm
  WHERE cm.user_id = NEW.challenger_id
    AND (v_club_id IS NULL OR cm.club_id = v_club_id)
  ORDER BY cm.joined_at DESC
  LIMIT 1;

  SELECT
    cm.league_player_rank,
    CASE
      WHEN lower(COALESCE(cm.gender, '')) IN ('female', 'ladies', 'f') THEN 'ladies'
      ELSE 'men'
    END
  INTO opponent_rank, opponent_group
  FROM public.club_members cm
  WHERE cm.user_id = NEW.opponent_id
    AND (v_club_id IS NULL OR cm.club_id = v_club_id)
  ORDER BY cm.joined_at DESC
  LIMIT 1;

  IF challenger_rank IS NULL OR opponent_rank IS NULL THEN
    RAISE EXCEPTION 'Both players must have a ladder rank';
  END IF;

  IF challenger_group IS DISTINCT FROM opponent_group THEN
    RAISE EXCEPTION 'Challenges are only allowed within the same ladder group';
  END IF;

  IF challenger_rank <= opponent_rank THEN
    RAISE EXCEPTION 'You may only challenge players above you';
  END IF;

  SELECT COALESCE(c.challenge_levels_up, 2)
  INTO max_levels
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

-- 2) Confirmed match effects update ladder rank in club_members only
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
  challenger_group text;
  opponent_group text;
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

  UPDATE public.profiles
  SET
    matches_played = matches_played + 1,
    wins = wins + CASE WHEN id = winner THEN 1 ELSE 0 END,
    losses = losses + CASE WHEN id = loser THEN 1 ELSE 0 END,
    updated_at = now()
  WHERE id IN (winner, loser);

  IF NEW.challenge_id IS NOT NULL THEN
    SELECT challenger_id, opponent_id, club_id
    INTO c_challenger, c_opponent, v_club_id
    FROM public.challenges
    WHERE id = NEW.challenge_id;

    IF v_club_id IS NULL THEN
      v_club_id := NEW.club_id;
    END IF;

    IF FOUND AND winner = c_challenger THEN
      SELECT
        cm.id,
        cm.league_player_rank,
        CASE
          WHEN lower(COALESCE(cm.gender, '')) IN ('female', 'ladies', 'f') THEN 'ladies'
          ELSE 'men'
        END
      INTO challenger_member_id, challenger_rank, challenger_group
      FROM public.club_members cm
      WHERE cm.user_id = c_challenger
        AND (v_club_id IS NULL OR cm.club_id = v_club_id)
      ORDER BY cm.joined_at DESC
      LIMIT 1;

      SELECT
        cm.league_player_rank,
        CASE
          WHEN lower(COALESCE(cm.gender, '')) IN ('female', 'ladies', 'f') THEN 'ladies'
          ELSE 'men'
        END
      INTO opponent_rank, opponent_group
      FROM public.club_members cm
      WHERE cm.user_id = c_opponent
        AND (v_club_id IS NULL OR cm.club_id = v_club_id)
      ORDER BY cm.joined_at DESC
      LIMIT 1;

      IF challenger_rank IS NOT NULL
         AND opponent_rank IS NOT NULL
         AND challenger_group = opponent_group
         AND challenger_rank > opponent_rank THEN

        UPDATE public.club_members cm
        SET league_player_rank = cm.league_player_rank + 1,
            updated_at = now()
        WHERE (v_club_id IS NULL OR cm.club_id = v_club_id)
          AND (
            (challenger_group = 'ladies' AND lower(COALESCE(cm.gender, '')) IN ('female', 'ladies', 'f'))
            OR
            (challenger_group = 'men' AND lower(COALESCE(cm.gender, '')) NOT IN ('female', 'ladies', 'f'))
          )
          AND cm.league_player_rank IS NOT NULL
          AND cm.league_player_rank >= opponent_rank
          AND cm.league_player_rank < challenger_rank
          AND cm.id <> challenger_member_id;

        UPDATE public.club_members
        SET league_player_rank = opponent_rank,
            updated_at = now()
        WHERE id = challenger_member_id;
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

-- 3) Admin reorder writes to club_members ladder rank only
CREATE OR REPLACE FUNCTION public.admin_reorder_ladder(player_ids uuid[], gender_filter text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  i integer;
  pid uuid;
  target_club_id uuid;
  target_group text;
BEGIN
  IF array_length(player_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  target_group := CASE
    WHEN lower(COALESCE(gender_filter, '')) IN ('female', 'ladies', 'f') THEN 'ladies'
    ELSE 'men'
  END;

  SELECT cm.club_id
  INTO target_club_id
  FROM public.club_members cm
  WHERE (cm.user_id = player_ids[1] OR cm.id = player_ids[1])
  LIMIT 1;

  IF target_club_id IS NULL THEN
    RAISE EXCEPTION 'Could not resolve target club for ladder reorder';
  END IF;

  IF NOT has_role(auth.uid(), 'admin') AND NOT is_club_admin(auth.uid(), target_club_id) THEN
    RAISE EXCEPTION 'Only admins can reorder the ladder';
  END IF;

  FOR i IN 1..array_length(player_ids, 1) LOOP
    pid := player_ids[i];

    UPDATE public.club_members cm
    SET league_player_rank = i,
        updated_at = now()
    WHERE (cm.user_id = pid OR cm.id = pid)
      AND cm.club_id = target_club_id
      AND (
        (target_group = 'ladies' AND lower(COALESCE(cm.gender, '')) IN ('female', 'ladies', 'f'))
        OR
        (target_group = 'men' AND lower(COALESCE(cm.gender, '')) NOT IN ('female', 'ladies', 'f'))
      );
  END LOOP;
END;
$function$;

-- 4) Auto-assign ladder rank to newly inserted members (append to bottom within club+gender group)
CREATE OR REPLACE FUNCTION public.set_default_ladder_rank()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_group text;
  v_next_rank integer;
BEGIN
  IF NEW.league_player_rank IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_group := CASE
    WHEN lower(COALESCE(NEW.gender, '')) IN ('female', 'ladies', 'f') THEN 'ladies'
    ELSE 'men'
  END;

  SELECT COALESCE(MAX(cm.league_player_rank), 0) + 1
  INTO v_next_rank
  FROM public.club_members cm
  WHERE cm.club_id = NEW.club_id
    AND (
      (v_group = 'ladies' AND lower(COALESCE(cm.gender, '')) IN ('female', 'ladies', 'f'))
      OR
      (v_group = 'men' AND lower(COALESCE(cm.gender, '')) NOT IN ('female', 'ladies', 'f'))
    );

  NEW.league_player_rank := v_next_rank;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS set_default_ladder_rank_on_club_members ON public.club_members;

CREATE TRIGGER set_default_ladder_rank_on_club_members
BEFORE INSERT ON public.club_members
FOR EACH ROW
EXECUTE FUNCTION public.set_default_ladder_rank();