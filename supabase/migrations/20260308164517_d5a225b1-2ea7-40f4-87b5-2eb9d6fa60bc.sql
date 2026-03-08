
-- ============================================
-- 1. ACHIEVEMENTS & XP SYSTEM
-- ============================================

-- Badge definitions (admin-managed catalog)
CREATE TABLE public.badge_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  icon text NOT NULL DEFAULT 'trophy',
  category text NOT NULL DEFAULT 'general',
  xp_reward integer NOT NULL DEFAULT 0,
  criteria jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.badge_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Badges readable by all authenticated"
  ON public.badge_definitions FOR SELECT TO authenticated USING (true);

-- User earned badges
CREATE TABLE public.user_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  badge_id uuid NOT NULL REFERENCES public.badge_definitions(id) ON DELETE CASCADE,
  earned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, badge_id)
);

ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view all badges"
  ON public.user_badges FOR SELECT TO authenticated USING (true);
CREATE POLICY "System can insert badges"
  ON public.user_badges FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- XP ledger
CREATE TABLE public.xp_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount integer NOT NULL,
  reason text NOT NULL,
  reference_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.xp_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own xp"
  ON public.xp_events FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own xp"
  ON public.xp_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Streaks tracking
CREATE TABLE public.user_streaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE NOT NULL,
  current_win_streak integer NOT NULL DEFAULT 0,
  best_win_streak integer NOT NULL DEFAULT 0,
  current_play_streak integer NOT NULL DEFAULT 0,
  best_play_streak integer NOT NULL DEFAULT 0,
  last_match_date date,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_streaks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Streaks readable by all authenticated"
  ON public.user_streaks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can upsert own streaks"
  ON public.user_streaks FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own streaks"
  ON public.user_streaks FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

-- ============================================
-- 2. SOCIAL FEED
-- ============================================

CREATE TABLE public.feed_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL DEFAULT 'post',
  content text,
  reference_type text,
  reference_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.feed_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Feed posts readable by all authenticated"
  ON public.feed_posts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can create own posts"
  ON public.feed_posts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own posts"
  ON public.feed_posts FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own posts"
  ON public.feed_posts FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Reactions
CREATE TABLE public.feed_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.feed_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  emoji text NOT NULL DEFAULT '🔥',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id, emoji)
);

ALTER TABLE public.feed_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Reactions readable by all authenticated"
  ON public.feed_reactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can add reactions"
  ON public.feed_reactions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can remove own reactions"
  ON public.feed_reactions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Comments
CREATE TABLE public.feed_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.feed_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.feed_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Comments readable by all authenticated"
  ON public.feed_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can add comments"
  ON public.feed_comments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own comments"
  ON public.feed_comments FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ============================================
-- 3. SMART SCHEDULING / AVAILABILITY
-- ============================================

CREATE TABLE public.player_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, day_of_week, start_time)
);

ALTER TABLE public.player_availability ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Availability readable by all authenticated"
  ON public.player_availability FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can manage own availability"
  ON public.player_availability FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own availability"
  ON public.player_availability FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own availability"
  ON public.player_availability FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Enable realtime for feed_posts and feed_reactions
ALTER PUBLICATION supabase_realtime ADD TABLE public.feed_posts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.feed_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.feed_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_badges;
