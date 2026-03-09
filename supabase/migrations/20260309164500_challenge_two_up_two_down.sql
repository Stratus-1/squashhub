-- Challenge restriction: only within 2 ladder positions (up or down).
-- Example: rank 10 can challenge 8,9,11,12.

CREATE OR REPLACE FUNCTION public.validate_challenge_insert()
RETURNS TRIGGER AS $$
DECLARE
  challenger_rank integer;
  opponent_rank integer;
  existing_id uuid;
  diff integer;
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

  diff := abs(challenger_rank - opponent_rank);

  IF diff < 1 THEN
    RAISE EXCEPTION 'Invalid ladder rank difference';
  END IF;

  IF diff > 2 THEN
    RAISE EXCEPTION 'You may only challenge players within 2 ladder positions';
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

