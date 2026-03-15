
-- 1. set_challenge_club_id: add member_id fallback
CREATE OR REPLACE FUNCTION public.set_challenge_club_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.club_id IS NULL AND NEW.challenger_member_id IS NOT NULL THEN
    SELECT club_id INTO NEW.club_id FROM public.club_members WHERE id = NEW.challenger_member_id;
  END IF;
  IF NEW.club_id IS NULL AND NEW.challenger_id IS NOT NULL THEN
    SELECT cm.club_id INTO NEW.club_id
    FROM public.club_members cm
    WHERE cm.user_id = NEW.challenger_id
    ORDER BY cm.joined_at DESC LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

-- 2. set_match_club_id: add member_id fallback
CREATE OR REPLACE FUNCTION public.set_match_club_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.club_id IS NULL AND NEW.player_a_member_id IS NOT NULL THEN
    SELECT club_id INTO NEW.club_id FROM public.club_members WHERE id = NEW.player_a_member_id;
  END IF;
  IF NEW.club_id IS NULL AND NEW.player_a IS NOT NULL THEN
    SELECT cm.club_id INTO NEW.club_id
    FROM public.club_members cm
    WHERE cm.user_id = NEW.player_a
    ORDER BY cm.joined_at DESC LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

-- 3. validate_match_insert: support member_id-based checks
CREATE OR REPLACE FUNCTION public.validate_match_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  c_challenger uuid;
  c_opponent uuid;
  c_challenger_member uuid;
  c_opponent_member uuid;
  c_status text;
  winner_is_player boolean;
BEGIN
  -- Winner validation: check both user_id and member_id
  IF NEW.winner_id IS NOT NULL THEN
    IF NEW.winner_id NOT IN (NEW.player_a, NEW.player_b) THEN
      RAISE EXCEPTION 'Winner must be one of the players';
    END IF;
  END IF;
  IF NEW.winner_member_id IS NOT NULL AND NEW.player_a_member_id IS NOT NULL AND NEW.player_b_member_id IS NOT NULL THEN
    IF NEW.winner_member_id NOT IN (NEW.player_a_member_id, NEW.player_b_member_id) THEN
      RAISE EXCEPTION 'Winner must be one of the players';
    END IF;
  END IF;

  IF NEW.challenge_id IS NOT NULL THEN
    SELECT challenger_id, opponent_id, challenger_member_id, opponent_member_id, status
    INTO c_challenger, c_opponent, c_challenger_member, c_opponent_member, c_status
    FROM public.challenges
    WHERE id = NEW.challenge_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Invalid challenge_id';
    END IF;

    IF c_status <> 'accepted' THEN
      RAISE EXCEPTION 'Challenge must be accepted before recording a match';
    END IF;

    -- Validate players match challenge participants (check member_ids first, then user_ids)
    IF c_challenger_member IS NOT NULL AND c_opponent_member IS NOT NULL
       AND NEW.player_a_member_id IS NOT NULL AND NEW.player_b_member_id IS NOT NULL THEN
      IF NOT (
        (NEW.player_a_member_id = c_challenger_member AND NEW.player_b_member_id = c_opponent_member)
        OR
        (NEW.player_a_member_id = c_opponent_member AND NEW.player_b_member_id = c_challenger_member)
      ) THEN
        RAISE EXCEPTION 'Match players must match the challenge participants';
      END IF;
    ELSIF c_challenger IS NOT NULL AND c_opponent IS NOT NULL
          AND NEW.player_a IS NOT NULL AND NEW.player_b IS NOT NULL THEN
      IF NOT (
        (NEW.player_a = c_challenger AND NEW.player_b = c_opponent)
        OR
        (NEW.player_a = c_opponent AND NEW.player_b = c_challenger)
      ) THEN
        RAISE EXCEPTION 'Match players must match the challenge participants';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Update challenges UPDATE RLS to support member_id-based access
DROP POLICY IF EXISTS "Participants can update challenges" ON public.challenges;
CREATE POLICY "Participants can update challenges"
ON public.challenges FOR UPDATE TO authenticated
USING (
  (auth.uid() = challenger_id OR auth.uid() = opponent_id
   OR (challenger_member_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.club_members WHERE id = challenger_member_id AND user_id = auth.uid()))
   OR (opponent_member_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.club_members WHERE id = opponent_member_id AND user_id = auth.uid()))
  )
  AND ((club_id IS NULL) OR is_club_member(auth.uid(), club_id))
);

-- 5. Update challenge_schedules RLS to support member_id-based access
DROP POLICY IF EXISTS "Participants can view challenge schedules" ON public.challenge_schedules;
CREATE POLICY "Participants can view challenge schedules"
ON public.challenge_schedules FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM challenges c
  WHERE c.id = challenge_schedules.challenge_id
  AND (c.challenger_id = auth.uid() OR c.opponent_id = auth.uid()
    OR (c.challenger_member_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.club_members WHERE id = c.challenger_member_id AND user_id = auth.uid()))
    OR (c.opponent_member_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.club_members WHERE id = c.opponent_member_id AND user_id = auth.uid()))
  )
));

DROP POLICY IF EXISTS "Participants can propose schedules" ON public.challenge_schedules;
CREATE POLICY "Participants can propose schedules"
ON public.challenge_schedules FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = proposed_by
  AND EXISTS (
    SELECT 1 FROM challenges c
    WHERE c.id = challenge_schedules.challenge_id
    AND (c.challenger_id = auth.uid() OR c.opponent_id = auth.uid()
      OR (c.challenger_member_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.club_members WHERE id = c.challenger_member_id AND user_id = auth.uid()))
      OR (c.opponent_member_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.club_members WHERE id = c.opponent_member_id AND user_id = auth.uid()))
    )
  )
);

DROP POLICY IF EXISTS "Participants can update schedules" ON public.challenge_schedules;
CREATE POLICY "Participants can update schedules"
ON public.challenge_schedules FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM challenges c
  WHERE c.id = challenge_schedules.challenge_id
  AND (c.challenger_id = auth.uid() OR c.opponent_id = auth.uid()
    OR (c.challenger_member_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.club_members WHERE id = c.challenger_member_id AND user_id = auth.uid()))
    OR (c.opponent_member_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.club_members WHERE id = c.opponent_member_id AND user_id = auth.uid()))
  )
));
