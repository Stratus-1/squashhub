
-- 1. Scope league_fixture_results writes to participant clubs only
DROP POLICY IF EXISTS "Captains and admins can insert fixture results" ON public.league_fixture_results;
DROP POLICY IF EXISTS "Captains and admins can update fixture results" ON public.league_fixture_results;

CREATE POLICY "Captains and admins can insert fixture results"
ON public.league_fixture_results FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.platform_league_fixtures plf
    JOIN public.leagues l
      ON l.nsa_team_code IN (plf.home_team_code, plf.away_team_code)
    JOIN public.club_members cm
      ON cm.club_id = l.club_id
     AND cm.user_id = auth.uid()
     AND cm.role = ANY (ARRAY['admin'::club_member_role,'captain'::club_member_role])
    WHERE plf.id = league_fixture_results.fixture_id
  )
);

CREATE POLICY "Captains and admins can update fixture results"
ON public.league_fixture_results FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.platform_league_fixtures plf
    JOIN public.leagues l
      ON l.nsa_team_code IN (plf.home_team_code, plf.away_team_code)
    JOIN public.club_members cm
      ON cm.club_id = l.club_id
     AND cm.user_id = auth.uid()
     AND cm.role = ANY (ARRAY['admin'::club_member_role,'captain'::club_member_role])
    WHERE plf.id = league_fixture_results.fixture_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.platform_league_fixtures plf
    JOIN public.leagues l
      ON l.nsa_team_code IN (plf.home_team_code, plf.away_team_code)
    JOIN public.club_members cm
      ON cm.club_id = l.club_id
     AND cm.user_id = auth.uid()
     AND cm.role = ANY (ARRAY['admin'::club_member_role,'captain'::club_member_role])
    WHERE plf.id = league_fixture_results.fixture_id
  )
);

-- 2. Same scoping for league_match_results
DROP POLICY IF EXISTS "Captains and admins can insert match results" ON public.league_match_results;
DROP POLICY IF EXISTS "Captains and admins can update match results" ON public.league_match_results;

CREATE POLICY "Captains and admins can insert match results"
ON public.league_match_results FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.platform_league_fixtures plf
    JOIN public.leagues l
      ON l.nsa_team_code IN (plf.home_team_code, plf.away_team_code)
    JOIN public.club_members cm
      ON cm.club_id = l.club_id
     AND cm.user_id = auth.uid()
     AND cm.role = ANY (ARRAY['admin'::club_member_role,'captain'::club_member_role])
    WHERE plf.id = league_match_results.fixture_id
  )
);

CREATE POLICY "Captains and admins can update match results"
ON public.league_match_results FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.platform_league_fixtures plf
    JOIN public.leagues l
      ON l.nsa_team_code IN (plf.home_team_code, plf.away_team_code)
    JOIN public.club_members cm
      ON cm.club_id = l.club_id
     AND cm.user_id = auth.uid()
     AND cm.role = ANY (ARRAY['admin'::club_member_role,'captain'::club_member_role])
    WHERE plf.id = league_match_results.fixture_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.platform_league_fixtures plf
    JOIN public.leagues l
      ON l.nsa_team_code IN (plf.home_team_code, plf.away_team_code)
    JOIN public.club_members cm
      ON cm.club_id = l.club_id
     AND cm.user_id = auth.uid()
     AND cm.role = ANY (ARRAY['admin'::club_member_role,'captain'::club_member_role])
    WHERE plf.id = league_match_results.fixture_id
  )
);

-- 3. Restrict member-faces bucket SELECT to owner or club admin
DROP POLICY IF EXISTS "Authenticated users can view member faces" ON storage.objects;

CREATE POLICY "Owner or club admin can view member faces"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'member-faces'
  AND (
    (auth.uid())::text = split_part(storage.filename(name), '.', 1)
    OR public.is_club_admin(auth.uid(), ((storage.foldername(name))[1])::uuid)
  )
);

-- 4. live_marker_sessions: restrict SELECT to authenticated only
DROP POLICY IF EXISTS "Anyone can view live marker sessions" ON public.live_marker_sessions;

CREATE POLICY "Authenticated users can view live marker sessions"
ON public.live_marker_sessions FOR SELECT TO authenticated
USING (expires_at > now());

-- 5. league_rules: require authentication for reads
DROP POLICY IF EXISTS "View league rules" ON public.league_rules;

CREATE POLICY "View league rules"
ON public.league_rules FOR SELECT TO authenticated
USING (
  association_id IS NOT NULL
  OR (
    club_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = league_rules.club_id
        AND cm.user_id = auth.uid()
    )
  )
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- 6. member_fee_categories: restrict SELECT to authenticated only
DROP POLICY IF EXISTS "Authenticated users can view fee categories" ON public.member_fee_categories;
DROP POLICY IF EXISTS "Public can view fee categories" ON public.member_fee_categories;

CREATE POLICY "Authenticated users can view fee categories"
ON public.member_fee_categories FOR SELECT TO authenticated
USING (true);
