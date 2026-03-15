
-- Update validate_challenge_insert to support member-based lookups
-- when players don't have user accounts
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
  IF NEW.challenger_id = NEW.opponent_id AND NEW.opponent_id IS NOT NULL THEN
    RAISE EXCEPTION 'You cannot challenge yourself';
  END IF;

  v_club_id := NEW.club_id;
  IF v_club_id IS NULL THEN
    SELECT cm.club_id INTO v_club_id
    FROM public.club_members cm
    WHERE cm.user_id = NEW.challenger_id
       OR cm.id = NEW.challenger_member_id
    ORDER BY cm.joined_at DESC
    LIMIT 1;
  END IF;

  -- Look up challenger by user_id or member_id
  SELECT
    cm.ladder_position,
    CASE WHEN lower(COALESCE(cm.gender, '')) IN ('female', 'ladies', 'f') THEN 'ladies' ELSE 'men' END
  INTO challenger_rank, challenger_group
  FROM public.club_members cm
  WHERE (
    (NEW.challenger_id IS NOT NULL AND cm.user_id = NEW.challenger_id)
    OR (NEW.challenger_member_id IS NOT NULL AND cm.id = NEW.challenger_member_id)
  )
    AND (v_club_id IS NULL OR cm.club_id = v_club_id)
  ORDER BY cm.joined_at DESC
  LIMIT 1;

  -- Look up opponent by user_id or member_id
  SELECT
    cm.ladder_position,
    CASE WHEN lower(COALESCE(cm.gender, '')) IN ('female', 'ladies', 'f') THEN 'ladies' ELSE 'men' END
  INTO opponent_rank, opponent_group
  FROM public.club_members cm
  WHERE (
    (NEW.opponent_id IS NOT NULL AND cm.user_id = NEW.opponent_id)
    OR (NEW.opponent_member_id IS NOT NULL AND cm.id = NEW.opponent_member_id)
  )
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

  -- Check for existing active challenges using both user_id and member_id
  SELECT id INTO existing_id
  FROM public.challenges
  WHERE status IN ('pending', 'accepted')
    AND (
      -- Check by member_id if available
      (NEW.challenger_member_id IS NOT NULL AND NEW.opponent_member_id IS NOT NULL AND (
        (challenger_member_id = NEW.challenger_member_id AND opponent_member_id = NEW.opponent_member_id)
        OR
        (challenger_member_id = NEW.opponent_member_id AND opponent_member_id = NEW.challenger_member_id)
      ))
      OR
      -- Fallback to user_id check
      (NEW.opponent_id IS NOT NULL AND (
        (challenger_id = NEW.challenger_id AND opponent_id = NEW.opponent_id)
        OR
        (challenger_id = NEW.opponent_id AND opponent_id = NEW.challenger_id)
      ))
    )
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'An active challenge already exists between these players';
  END IF;

  NEW.status := COALESCE(NEW.status, 'pending');
  RETURN NEW;
END;
$function$;
