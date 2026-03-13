-- =========================================================
-- TENANT SCOPING: Add club_id to core tables
-- =========================================================

-- 1. BOOKINGS — backfill from courts.club_id
ALTER TABLE public.bookings ADD COLUMN IF NOT EXISTS club_id uuid;

UPDATE public.bookings b
SET club_id = c.club_id
FROM public.courts c
WHERE c.id = b.court_id AND b.club_id IS NULL;

-- Auto-set club_id on insert from court
CREATE OR REPLACE FUNCTION public.set_booking_club_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.club_id IS NULL THEN
    SELECT club_id INTO NEW.club_id FROM public.courts WHERE id = NEW.court_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_set_booking_club_id ON public.bookings;
CREATE TRIGGER trg_set_booking_club_id
  BEFORE INSERT ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.set_booking_club_id();

-- Tenant-scoped RLS for bookings
DROP POLICY IF EXISTS "Bookings viewable by all authenticated" ON public.bookings;
CREATE POLICY "Club members can view bookings"
  ON public.bookings FOR SELECT TO authenticated
  USING (club_id IS NOT NULL AND is_club_member(auth.uid(), club_id));

-- 2. CHALLENGES — add club_id, backfill from challenger's club
ALTER TABLE public.challenges ADD COLUMN IF NOT EXISTS club_id uuid;

UPDATE public.challenges ch
SET club_id = cm.club_id
FROM public.club_members cm
WHERE cm.user_id = ch.challenger_id AND ch.club_id IS NULL;

CREATE OR REPLACE FUNCTION public.set_challenge_club_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.club_id IS NULL THEN
    SELECT cm.club_id INTO NEW.club_id
    FROM public.club_members cm
    WHERE cm.user_id = NEW.challenger_id
    ORDER BY cm.joined_at DESC LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_set_challenge_club_id ON public.challenges;
CREATE TRIGGER trg_set_challenge_club_id
  BEFORE INSERT ON public.challenges
  FOR EACH ROW EXECUTE FUNCTION public.set_challenge_club_id();

DROP POLICY IF EXISTS "Challenges viewable by all authenticated" ON public.challenges;
CREATE POLICY "Club members can view challenges"
  ON public.challenges FOR SELECT TO authenticated
  USING (club_id IS NOT NULL AND is_club_member(auth.uid(), club_id));

-- 3. MATCHES — add club_id, backfill from player_a's club
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS club_id uuid;

UPDATE public.matches m
SET club_id = cm.club_id
FROM public.club_members cm
WHERE cm.user_id = m.player_a AND m.club_id IS NULL;

CREATE OR REPLACE FUNCTION public.set_match_club_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.club_id IS NULL THEN
    SELECT cm.club_id INTO NEW.club_id
    FROM public.club_members cm
    WHERE cm.user_id = NEW.player_a
    ORDER BY cm.joined_at DESC LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_set_match_club_id ON public.matches;
CREATE TRIGGER trg_set_match_club_id
  BEFORE INSERT ON public.matches
  FOR EACH ROW EXECUTE FUNCTION public.set_match_club_id();

DROP POLICY IF EXISTS "Matches viewable by all authenticated" ON public.matches;
CREATE POLICY "Club members can view matches"
  ON public.matches FOR SELECT TO authenticated
  USING (club_id IS NOT NULL AND is_club_member(auth.uid(), club_id));

-- 4. FEED_POSTS — add club_id, backfill from user's club
ALTER TABLE public.feed_posts ADD COLUMN IF NOT EXISTS club_id uuid;

UPDATE public.feed_posts fp
SET club_id = cm.club_id
FROM public.club_members cm
WHERE cm.user_id = fp.user_id AND fp.club_id IS NULL;

CREATE OR REPLACE FUNCTION public.set_feed_post_club_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.club_id IS NULL THEN
    SELECT cm.club_id INTO NEW.club_id
    FROM public.club_members cm
    WHERE cm.user_id = NEW.user_id
    ORDER BY cm.joined_at DESC LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_set_feed_post_club_id ON public.feed_posts;
CREATE TRIGGER trg_set_feed_post_club_id
  BEFORE INSERT ON public.feed_posts
  FOR EACH ROW EXECUTE FUNCTION public.set_feed_post_club_id();

DROP POLICY IF EXISTS "Feed posts readable by all authenticated" ON public.feed_posts;
CREATE POLICY "Club members can view feed posts"
  ON public.feed_posts FOR SELECT TO authenticated
  USING (club_id IS NOT NULL AND is_club_member(auth.uid(), club_id));

-- 5. FEE_PAYMENTS — add club_id, backfill from user's club
ALTER TABLE public.fee_payments ADD COLUMN IF NOT EXISTS club_id uuid;

UPDATE public.fee_payments fp
SET club_id = cm.club_id
FROM public.club_members cm
WHERE cm.user_id = fp.user_id AND fp.club_id IS NULL;

CREATE OR REPLACE FUNCTION public.set_fee_payment_club_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.club_id IS NULL THEN
    SELECT cm.club_id INTO NEW.club_id
    FROM public.club_members cm
    WHERE cm.user_id = NEW.user_id
    ORDER BY cm.joined_at DESC LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_set_fee_payment_club_id ON public.fee_payments;
CREATE TRIGGER trg_set_fee_payment_club_id
  BEFORE INSERT ON public.fee_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_fee_payment_club_id();

-- 6. RECURRING_BOOKINGS — add club_id, backfill from courts
ALTER TABLE public.recurring_bookings ADD COLUMN IF NOT EXISTS club_id uuid;

UPDATE public.recurring_bookings rb
SET club_id = c.club_id
FROM public.courts c
WHERE c.id = rb.court_id AND rb.club_id IS NULL;

CREATE OR REPLACE FUNCTION public.set_recurring_booking_club_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.club_id IS NULL THEN
    SELECT club_id INTO NEW.club_id FROM public.courts WHERE id = NEW.court_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_set_recurring_booking_club_id ON public.recurring_bookings;
CREATE TRIGGER trg_set_recurring_booking_club_id
  BEFORE INSERT ON public.recurring_bookings
  FOR EACH ROW EXECUTE FUNCTION public.set_recurring_booking_club_id();

-- 7. INDEXES for new club_id columns
CREATE INDEX IF NOT EXISTS idx_bookings_club_id ON public.bookings(club_id);
CREATE INDEX IF NOT EXISTS idx_challenges_club_id ON public.challenges(club_id);
CREATE INDEX IF NOT EXISTS idx_matches_club_id ON public.matches(club_id);
CREATE INDEX IF NOT EXISTS idx_feed_posts_club_id ON public.feed_posts(club_id);
CREATE INDEX IF NOT EXISTS idx_fee_payments_club_id ON public.fee_payments(club_id);
CREATE INDEX IF NOT EXISTS idx_recurring_bookings_club_id ON public.recurring_bookings(club_id);

-- 8. MATCH_DISPUTES — scope to club via match
DROP POLICY IF EXISTS "Disputes readable by all authenticated" ON public.match_disputes;
CREATE POLICY "Club members can view disputes"
  ON public.match_disputes FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.matches m
    WHERE m.id = match_disputes.match_id
    AND m.club_id IS NOT NULL
    AND is_club_member(auth.uid(), m.club_id)
  ));

-- 9. Ensure challenge insert/update policies also check club membership
DROP POLICY IF EXISTS "Users can create challenges" ON public.challenges;
CREATE POLICY "Users can create challenges"
  ON public.challenges FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = challenger_id
    AND club_id IS NOT NULL
    AND is_club_member(auth.uid(), club_id)
  );

DROP POLICY IF EXISTS "Participants can update challenges" ON public.challenges;
CREATE POLICY "Participants can update challenges"
  ON public.challenges FOR UPDATE TO authenticated
  USING (
    (auth.uid() = challenger_id OR auth.uid() = opponent_id)
    AND (club_id IS NULL OR is_club_member(auth.uid(), club_id))
  );

-- 10. Match create/update policies with club scope
DROP POLICY IF EXISTS "Users can create matches they participate in" ON public.matches;
CREATE POLICY "Users can create matches they participate in"
  ON public.matches FOR INSERT TO authenticated
  WITH CHECK (
    (auth.uid() = player_a OR auth.uid() = player_b)
    AND (club_id IS NULL OR is_club_member(auth.uid(), club_id))
  );

DROP POLICY IF EXISTS "Participants can update matches" ON public.matches;
CREATE POLICY "Participants can update matches"
  ON public.matches FOR UPDATE TO authenticated
  USING (
    (auth.uid() = player_a OR auth.uid() = player_b)
    AND (club_id IS NULL OR is_club_member(auth.uid(), club_id))
  );

-- 11. Booking create/update with club scope
DROP POLICY IF EXISTS "Users can create bookings" ON public.bookings;
CREATE POLICY "Users can create bookings"
  ON public.bookings FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (club_id IS NULL OR is_club_member(auth.uid(), club_id))
  );

DROP POLICY IF EXISTS "Users can cancel own bookings" ON public.bookings;
CREATE POLICY "Users can cancel own bookings"
  ON public.bookings FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- 12. Feed post create with club scope
DROP POLICY IF EXISTS "Users can create own posts" ON public.feed_posts;
CREATE POLICY "Users can create own posts"
  ON public.feed_posts FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (club_id IS NULL OR is_club_member(auth.uid(), club_id))
  );

-- 13. Feed comments/reactions — scope via post's club_id
DROP POLICY IF EXISTS "Comments readable by all authenticated" ON public.feed_comments;
CREATE POLICY "Club members can view comments"
  ON public.feed_comments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.feed_posts fp
    WHERE fp.id = feed_comments.post_id
    AND (fp.club_id IS NULL OR is_club_member(auth.uid(), fp.club_id))
  ));

DROP POLICY IF EXISTS "Reactions readable by all authenticated" ON public.feed_reactions;
CREATE POLICY "Club members can view reactions"
  ON public.feed_reactions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.feed_posts fp
    WHERE fp.id = feed_reactions.post_id
    AND (fp.club_id IS NULL OR is_club_member(auth.uid(), fp.club_id))
  ));