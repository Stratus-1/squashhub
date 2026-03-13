-- Add explicit search_path to trigger validation functions

CREATE OR REPLACE FUNCTION public.validate_challenge_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
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

CREATE OR REPLACE FUNCTION public.validate_challenge_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.validate_match_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
$function$;