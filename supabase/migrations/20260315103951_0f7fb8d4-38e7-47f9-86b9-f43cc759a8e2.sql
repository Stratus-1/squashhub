
-- 1. Helper function: check if auth user owns a member record
CREATE OR REPLACE FUNCTION public.is_member_owner(_member_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.club_members
    WHERE id = _member_id AND user_id = auth.uid()
  )
$$;

-- 2. Add member_id columns to challenges
ALTER TABLE public.challenges 
  ADD COLUMN IF NOT EXISTS challenger_member_id uuid REFERENCES public.club_members(id),
  ADD COLUMN IF NOT EXISTS opponent_member_id uuid REFERENCES public.club_members(id);

-- 3. Add member_id columns to matches
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS player_a_member_id uuid REFERENCES public.club_members(id),
  ADD COLUMN IF NOT EXISTS player_b_member_id uuid REFERENCES public.club_members(id),
  ADD COLUMN IF NOT EXISTS winner_member_id uuid REFERENCES public.club_members(id),
  ADD COLUMN IF NOT EXISTS submitted_by_member_id uuid REFERENCES public.club_members(id);

-- 4. Add opponent_member_id to bookings
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS opponent_member_id uuid REFERENCES public.club_members(id);

-- 5. Auto-populate trigger for challenges (named aa_ to fire before validation triggers)
CREATE OR REPLACE FUNCTION public.populate_challenge_ids()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Member IDs -> User IDs
  IF NEW.challenger_member_id IS NOT NULL AND NEW.challenger_id IS NULL THEN
    SELECT user_id INTO NEW.challenger_id FROM public.club_members WHERE id = NEW.challenger_member_id;
  END IF;
  IF NEW.opponent_member_id IS NOT NULL AND NEW.opponent_id IS NULL THEN
    SELECT user_id INTO NEW.opponent_id FROM public.club_members WHERE id = NEW.opponent_member_id;
  END IF;
  IF NEW.club_id IS NULL AND NEW.challenger_member_id IS NOT NULL THEN
    SELECT club_id INTO NEW.club_id FROM public.club_members WHERE id = NEW.challenger_member_id;
  END IF;
  -- User IDs -> Member IDs (backward compat)
  IF NEW.challenger_member_id IS NULL AND NEW.challenger_id IS NOT NULL THEN
    SELECT id INTO NEW.challenger_member_id FROM public.club_members
    WHERE user_id = NEW.challenger_id AND (NEW.club_id IS NULL OR club_id = NEW.club_id)
    ORDER BY joined_at DESC LIMIT 1;
  END IF;
  IF NEW.opponent_member_id IS NULL AND NEW.opponent_id IS NOT NULL THEN
    SELECT id INTO NEW.opponent_member_id FROM public.club_members
    WHERE user_id = NEW.opponent_id AND (NEW.club_id IS NULL OR club_id = NEW.club_id)
    ORDER BY joined_at DESC LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS aa_populate_challenge_ids ON public.challenges;
CREATE TRIGGER aa_populate_challenge_ids
  BEFORE INSERT ON public.challenges
  FOR EACH ROW EXECUTE FUNCTION public.populate_challenge_ids();

-- 6. Auto-populate trigger for matches
CREATE OR REPLACE FUNCTION public.populate_match_ids()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Member IDs -> User IDs
  IF NEW.player_a_member_id IS NOT NULL AND NEW.player_a IS NULL THEN
    SELECT user_id INTO NEW.player_a FROM public.club_members WHERE id = NEW.player_a_member_id;
  END IF;
  IF NEW.player_b_member_id IS NOT NULL AND NEW.player_b IS NULL THEN
    SELECT user_id INTO NEW.player_b FROM public.club_members WHERE id = NEW.player_b_member_id;
  END IF;
  IF NEW.winner_member_id IS NOT NULL AND NEW.winner_id IS NULL THEN
    SELECT user_id INTO NEW.winner_id FROM public.club_members WHERE id = NEW.winner_member_id;
  END IF;
  IF NEW.submitted_by_member_id IS NOT NULL AND NEW.submitted_by IS NULL THEN
    SELECT user_id INTO NEW.submitted_by FROM public.club_members WHERE id = NEW.submitted_by_member_id;
  END IF;
  -- User IDs -> Member IDs (backward compat)
  IF NEW.player_a_member_id IS NULL AND NEW.player_a IS NOT NULL THEN
    SELECT id INTO NEW.player_a_member_id FROM public.club_members
    WHERE user_id = NEW.player_a AND (NEW.club_id IS NULL OR club_id = NEW.club_id)
    ORDER BY joined_at DESC LIMIT 1;
  END IF;
  IF NEW.player_b_member_id IS NULL AND NEW.player_b IS NOT NULL THEN
    SELECT id INTO NEW.player_b_member_id FROM public.club_members
    WHERE user_id = NEW.player_b AND (NEW.club_id IS NULL OR club_id = NEW.club_id)
    ORDER BY joined_at DESC LIMIT 1;
  END IF;
  IF NEW.winner_member_id IS NULL AND NEW.winner_id IS NOT NULL THEN
    SELECT id INTO NEW.winner_member_id FROM public.club_members
    WHERE user_id = NEW.winner_id AND (NEW.club_id IS NULL OR club_id = NEW.club_id)
    ORDER BY joined_at DESC LIMIT 1;
  END IF;
  IF NEW.submitted_by_member_id IS NULL AND NEW.submitted_by IS NOT NULL THEN
    SELECT id INTO NEW.submitted_by_member_id FROM public.club_members
    WHERE user_id = NEW.submitted_by AND (NEW.club_id IS NULL OR club_id = NEW.club_id)
    ORDER BY joined_at DESC LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS aa_populate_match_ids ON public.matches;
CREATE TRIGGER aa_populate_match_ids
  BEFORE INSERT ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.populate_match_ids();

-- 7. Auto-populate trigger for bookings
CREATE OR REPLACE FUNCTION public.populate_booking_ids()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.opponent_member_id IS NOT NULL AND NEW.opponent_id IS NULL THEN
    SELECT user_id INTO NEW.opponent_id FROM public.club_members WHERE id = NEW.opponent_member_id;
  END IF;
  IF NEW.opponent_member_id IS NULL AND NEW.opponent_id IS NOT NULL THEN
    SELECT id INTO NEW.opponent_member_id FROM public.club_members
    WHERE user_id = NEW.opponent_id AND (NEW.club_id IS NULL OR club_id = NEW.club_id)
    ORDER BY joined_at DESC LIMIT 1;
  END IF;
  IF NEW.club_member_id IS NULL AND NEW.user_id IS NOT NULL THEN
    SELECT id INTO NEW.club_member_id FROM public.club_members
    WHERE user_id = NEW.user_id AND (NEW.club_id IS NULL OR club_id = NEW.club_id)
    ORDER BY joined_at DESC LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS aa_populate_booking_ids ON public.bookings;
CREATE TRIGGER aa_populate_booking_ids
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.populate_booking_ids();

-- 8. Backfill existing challenges
UPDATE public.challenges c SET
  challenger_member_id = (SELECT cm.id FROM public.club_members cm WHERE cm.user_id = c.challenger_id AND cm.club_id = c.club_id LIMIT 1),
  opponent_member_id = (SELECT cm.id FROM public.club_members cm WHERE cm.user_id = c.opponent_id AND cm.club_id = c.club_id LIMIT 1)
WHERE c.challenger_member_id IS NULL AND c.club_id IS NOT NULL;

-- 9. Backfill existing matches
UPDATE public.matches m SET
  player_a_member_id = (SELECT cm.id FROM public.club_members cm WHERE cm.user_id = m.player_a AND (m.club_id IS NULL OR cm.club_id = m.club_id) LIMIT 1),
  player_b_member_id = (SELECT cm.id FROM public.club_members cm WHERE cm.user_id = m.player_b AND (m.club_id IS NULL OR cm.club_id = m.club_id) LIMIT 1),
  winner_member_id = CASE WHEN m.winner_id IS NOT NULL THEN (SELECT cm.id FROM public.club_members cm WHERE cm.user_id = m.winner_id AND (m.club_id IS NULL OR cm.club_id = m.club_id) LIMIT 1) ELSE NULL END,
  submitted_by_member_id = CASE WHEN m.submitted_by IS NOT NULL THEN (SELECT cm.id FROM public.club_members cm WHERE cm.user_id = m.submitted_by AND (m.club_id IS NULL OR cm.club_id = m.club_id) LIMIT 1) ELSE NULL END
WHERE m.player_a_member_id IS NULL;

-- 10. Backfill existing bookings
UPDATE public.bookings b SET
  opponent_member_id = (SELECT cm.id FROM public.club_members cm WHERE cm.user_id = b.opponent_id AND (b.club_id IS NULL OR cm.club_id = b.club_id) LIMIT 1),
  club_member_id = COALESCE(b.club_member_id, (SELECT cm.id FROM public.club_members cm WHERE cm.user_id = b.user_id AND (b.club_id IS NULL OR cm.club_id = b.club_id) LIMIT 1))
WHERE (b.opponent_id IS NOT NULL AND b.opponent_member_id IS NULL) OR (b.club_member_id IS NULL AND b.user_id IS NOT NULL);
