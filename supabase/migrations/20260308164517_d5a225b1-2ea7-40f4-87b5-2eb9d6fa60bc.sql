
-- ============================================
-- 1. ACHIEVEMENTS & XP SYSTEM
-- ============================================

-- Badge definitions (admin-managed catalog)
CREATE TABLE IF NOT EXISTS public.badge_definitions (
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
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'badge_definitions' AND policyname = 'Badges readable by all authenticated'
  ) THEN
    CREATE POLICY "Badges readable by all authenticated"
      ON public.badge_definitions FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- User earned badges
CREATE TABLE IF NOT EXISTS public.user_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  badge_id uuid NOT NULL REFERENCES public.badge_definitions(id) ON DELETE CASCADE,
  earned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, badge_id)
);

ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_badges' AND policyname = 'Users can view all badges'
  ) THEN
    CREATE POLICY "Users can view all badges"
      ON public.user_badges FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_badges' AND policyname = 'System can insert badges'
  ) THEN
    CREATE POLICY "System can insert badges"
      ON public.user_badges FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- XP ledger
CREATE TABLE IF NOT EXISTS public.xp_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount integer NOT NULL,
  reason text NOT NULL,
  reference_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.xp_events ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'xp_events' AND policyname = 'Users can view own xp'
  ) THEN
    CREATE POLICY "Users can view own xp"
      ON public.xp_events FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'xp_events' AND policyname = 'Users can insert own xp'
  ) THEN
    CREATE POLICY "Users can insert own xp"
      ON public.xp_events FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Streaks tracking
CREATE TABLE IF NOT EXISTS public.user_streaks (
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
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_streaks' AND policyname = 'Streaks readable by all authenticated'
  ) THEN
    CREATE POLICY "Streaks readable by all authenticated"
      ON public.user_streaks FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_streaks' AND policyname = 'Users can upsert own streaks'
  ) THEN
    CREATE POLICY "Users can upsert own streaks"
      ON public.user_streaks FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_streaks' AND policyname = 'Users can update own streaks'
  ) THEN
    CREATE POLICY "Users can update own streaks"
      ON public.user_streaks FOR UPDATE TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================
-- 2. SOCIAL FEED
-- ============================================

CREATE TABLE IF NOT EXISTS public.feed_posts (
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
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'feed_posts' AND policyname = 'Feed posts readable by all authenticated'
  ) THEN
    CREATE POLICY "Feed posts readable by all authenticated"
      ON public.feed_posts FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'feed_posts' AND policyname = 'Users can create own posts'
  ) THEN
    CREATE POLICY "Users can create own posts"
      ON public.feed_posts FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'feed_posts' AND policyname = 'Users can update own posts'
  ) THEN
    CREATE POLICY "Users can update own posts"
      ON public.feed_posts FOR UPDATE TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'feed_posts' AND policyname = 'Users can delete own posts'
  ) THEN
    CREATE POLICY "Users can delete own posts"
      ON public.feed_posts FOR DELETE TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- Reactions
CREATE TABLE IF NOT EXISTS public.feed_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.feed_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  emoji text NOT NULL DEFAULT '🔥',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id, emoji)
);

ALTER TABLE public.feed_reactions ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'feed_reactions' AND policyname = 'Reactions readable by all authenticated'
  ) THEN
    CREATE POLICY "Reactions readable by all authenticated"
      ON public.feed_reactions FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'feed_reactions' AND policyname = 'Users can add reactions'
  ) THEN
    CREATE POLICY "Users can add reactions"
      ON public.feed_reactions FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'feed_reactions' AND policyname = 'Users can remove own reactions'
  ) THEN
    CREATE POLICY "Users can remove own reactions"
      ON public.feed_reactions FOR DELETE TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- Comments
CREATE TABLE IF NOT EXISTS public.feed_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.feed_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.feed_comments ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'feed_comments' AND policyname = 'Comments readable by all authenticated'
  ) THEN
    CREATE POLICY "Comments readable by all authenticated"
      ON public.feed_comments FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'feed_comments' AND policyname = 'Users can add comments'
  ) THEN
    CREATE POLICY "Users can add comments"
      ON public.feed_comments FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'feed_comments' AND policyname = 'Users can delete own comments'
  ) THEN
    CREATE POLICY "Users can delete own comments"
      ON public.feed_comments FOR DELETE TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- ============================================
-- 3. SMART SCHEDULING / AVAILABILITY
-- ============================================

-- Availability table already exists in this project (structured availability migration).
-- Keep this section idempotent so it won't fail on remote databases.
DO $$
BEGIN
  IF to_regclass('public.player_availability') IS NULL THEN
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

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'player_availability' AND policyname = 'Availability readable by all authenticated'
    ) THEN
      CREATE POLICY "Availability readable by all authenticated"
        ON public.player_availability FOR SELECT TO authenticated USING (true);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'player_availability' AND policyname = 'Users can manage own availability'
    ) THEN
      CREATE POLICY "Users can manage own availability"
        ON public.player_availability FOR INSERT TO authenticated
        WITH CHECK (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'player_availability' AND policyname = 'Users can update own availability'
    ) THEN
      CREATE POLICY "Users can update own availability"
        ON public.player_availability FOR UPDATE TO authenticated
        USING (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'player_availability' AND policyname = 'Users can delete own availability'
    ) THEN
      CREATE POLICY "Users can delete own availability"
        ON public.player_availability FOR DELETE TO authenticated
        USING (auth.uid() = user_id);
    END IF;
  END IF;
END $$;

-- Enable realtime for feed_posts and feed_reactions
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'feed_posts') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.feed_posts;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'feed_reactions') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.feed_reactions;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'feed_comments') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.feed_comments;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'user_badges') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_badges;
  END IF;
END $$;
