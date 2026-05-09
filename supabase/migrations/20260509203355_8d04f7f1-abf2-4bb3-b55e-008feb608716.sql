
-- =========================================================================
-- Security hardening migration
-- =========================================================================

-- 1) Restrict club_members "Anyone can view club delegates" to authenticated users
DROP POLICY IF EXISTS "Anyone can view club delegates" ON public.club_members;
CREATE POLICY "Authenticated users can view club delegates"
  ON public.club_members
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clubs c
      WHERE c.id = club_members.club_id
        AND (
          c.chairman_member_id    = club_members.id OR
          c.secretary_member_id   = club_members.id OR
          c.club_captain_member_id = club_members.id
        )
    )
  );

-- 2) Lock down xp_events — remove client INSERT (server/SECURITY DEFINER only)
DROP POLICY IF EXISTS "Users can insert own xp" ON public.xp_events;
DROP POLICY IF EXISTS "Users can insert their own xp" ON public.xp_events;
DROP POLICY IF EXISTS "Authenticated users can insert xp" ON public.xp_events;

-- 3) Lock down user_badges — remove client INSERT
DROP POLICY IF EXISTS "System can insert badges" ON public.user_badges;
DROP POLICY IF EXISTS "Users can insert their own badges" ON public.user_badges;

-- 4) Lock down user_streaks — remove client INSERT/UPDATE
DROP POLICY IF EXISTS "Users can update own streaks" ON public.user_streaks;
DROP POLICY IF EXISTS "Users can upsert own streaks" ON public.user_streaks;
DROP POLICY IF EXISTS "Users can insert own streaks" ON public.user_streaks;

-- 5) Restrict league_fixture_results / league_match_results writes to club admins or captains
DROP POLICY IF EXISTS "Authenticated users can insert league fixture results" ON public.league_fixture_results;
DROP POLICY IF EXISTS "Authenticated users can update league fixture results" ON public.league_fixture_results;
DROP POLICY IF EXISTS "Authenticated users can insert league match results" ON public.league_match_results;
DROP POLICY IF EXISTS "Authenticated users can update league match results" ON public.league_match_results;

CREATE POLICY "Captains and admins can insert fixture results"
  ON public.league_fixture_results
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.role IN ('admin','captain')
    )
  );

CREATE POLICY "Captains and admins can update fixture results"
  ON public.league_fixture_results
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.role IN ('admin','captain')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.role IN ('admin','captain')
    )
  );

CREATE POLICY "Captains and admins can insert match results"
  ON public.league_match_results
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.role IN ('admin','captain')
    )
  );

CREATE POLICY "Captains and admins can update match results"
  ON public.league_match_results
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.role IN ('admin','captain')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.role IN ('admin','captain')
    )
  );

-- 6) Make member-faces bucket private; restrict SELECT to authenticated users
UPDATE storage.buckets SET public = false WHERE id = 'member-faces';
DROP POLICY IF EXISTS "Public can view member faces" ON storage.objects;
CREATE POLICY "Authenticated users can view member faces"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'member-faces');

-- 7) Realtime: restrict realtime.messages topic subscriptions for support channels
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Support topic access" ON realtime.messages;
CREATE POLICY "Support topic access"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    -- Admin support listing channel — admins only
    (realtime.topic() = 'rt-support-threads-admin'
       AND public.has_role(auth.uid(), 'admin'::public.app_role))
    -- Per-user thread channel — owner only
    OR (realtime.topic() = 'rt-support-threads-' || auth.uid()::text)
    -- Per-thread message channel — thread owner or admins only
    OR (
      realtime.topic() LIKE 'rt-support-messages-%'
      AND EXISTS (
        SELECT 1 FROM public.support_threads t
        WHERE t.id::text = substring(realtime.topic() FROM 'rt-support-messages-(.*)')
          AND (t.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role))
      )
    )
    -- Allow Postgres-changes channels (per-table) since RLS on the source table governs visibility
    OR realtime.topic() LIKE 'realtime:%'
  );
