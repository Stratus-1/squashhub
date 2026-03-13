
ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS member_number_prefix text DEFAULT '',
  ADD COLUMN IF NOT EXISTS member_number_length integer DEFAULT 4,
  ADD COLUMN IF NOT EXISTS member_number_start integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS challenge_levels_up integer DEFAULT 2;

-- Update the challenge validation function to use club setting
CREATE OR REPLACE FUNCTION public.validate_challenge_insert()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  challenger_rank integer;
  opponent_rank integer;
  existing_id uuid;
  max_levels integer;
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

  -- Get the club's challenge_levels_up setting (fall back to 2)
  SELECT COALESCE(c.challenge_levels_up, 2) INTO max_levels
  FROM public.club_members cm
  JOIN public.clubs c ON c.id = cm.club_id
  WHERE cm.user_id = NEW.challenger_id
  LIMIT 1;

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
