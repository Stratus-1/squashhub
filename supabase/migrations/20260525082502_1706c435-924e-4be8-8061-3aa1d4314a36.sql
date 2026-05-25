
-- 1. club_members delegate exposure: restrict to same-club members
DROP POLICY IF EXISTS "Authenticated users can view club delegates" ON public.club_members;
CREATE POLICY "Same-club members can view club delegates"
ON public.club_members
FOR SELECT
TO authenticated
USING (
  is_club_member(auth.uid(), club_members.club_id)
  AND EXISTS (
    SELECT 1 FROM clubs c
    WHERE c.id = club_members.club_id
      AND (c.chairman_member_id = club_members.id
        OR c.secretary_member_id = club_members.id
        OR c.club_captain_member_id = club_members.id)
  )
);

-- 2. club_journal_entries: remove captain from insert
DROP POLICY IF EXISTS "Club admins can insert journal entries" ON public.club_journal_entries;
CREATE POLICY "Club admins can insert journal entries"
ON public.club_journal_entries
FOR INSERT
TO authenticated
WITH CHECK (is_club_admin(auth.uid(), club_id));

DROP POLICY IF EXISTS "Club admins can read journal entries" ON public.club_journal_entries;
CREATE POLICY "Club admins can read journal entries"
ON public.club_journal_entries
FOR SELECT
TO authenticated
USING (is_club_admin(auth.uid(), club_id));

-- 3. fee_payments: remove captain from insert/update/select
DROP POLICY IF EXISTS "Club admins can insert member fee payments" ON public.fee_payments;
CREATE POLICY "Club admins can insert member fee payments"
ON public.fee_payments
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM club_members cm_target
    WHERE cm_target.user_id = fee_payments.user_id
      AND is_club_admin(auth.uid(), cm_target.club_id)
  )
);

DROP POLICY IF EXISTS "Club admins can update member fee payments" ON public.fee_payments;
CREATE POLICY "Club admins can update member fee payments"
ON public.fee_payments
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM club_members cm_target
    WHERE cm_target.user_id = fee_payments.user_id
      AND is_club_admin(auth.uid(), cm_target.club_id)
  )
);

DROP POLICY IF EXISTS "Club admins can view member fee payments" ON public.fee_payments;
CREATE POLICY "Club admins can view member fee payments"
ON public.fee_payments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM club_members cm_target
    WHERE cm_target.user_id = fee_payments.user_id
      AND is_club_admin(auth.uid(), cm_target.club_id)
  )
);

-- 4. live_marker_sessions: restrict SELECT to owner or club members
DROP POLICY IF EXISTS "Authenticated users can view live marker sessions" ON public.live_marker_sessions;
CREATE POLICY "Owner or club members can view live marker sessions"
ON public.live_marker_sessions
FOR SELECT
TO authenticated
USING (
  expires_at > now()
  AND (
    auth.uid() = marker_user_id
    OR (club_id IS NOT NULL AND is_club_member(auth.uid(), club_id))
  )
);

-- 5. league_fixture_results: tighten cross-club write access
DROP POLICY IF EXISTS "Participating club members can insert fixture results" ON public.league_fixture_results;
DROP POLICY IF EXISTS "Participating club members can update fixture results" ON public.league_fixture_results;

CREATE POLICY "Participating captains can insert fixture results"
ON public.league_fixture_results
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM platform_league_fixtures plf
    JOIN leagues l ON l.id IS NOT NULL
      AND (
        (NULLIF(upper(l.nsa_team_code), '') = upper(plf.home_team_code))
        OR (NULLIF(upper(l.nsa_team_code), '') = upper(plf.away_team_code))
        OR (NULLIF(upper(l.code), '') = upper(plf.home_team_code))
        OR (NULLIF(upper(l.code), '') = upper(plf.away_team_code))
      )
    JOIN club_members cm ON cm.club_id = l.club_id AND cm.user_id = auth.uid()
    WHERE plf.id = league_fixture_results.fixture_id
      AND cm.role IN ('admin'::club_member_role, 'captain'::club_member_role)
  )
);

CREATE POLICY "Participating captains can update fixture results"
ON public.league_fixture_results
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM platform_league_fixtures plf
    JOIN leagues l ON l.id IS NOT NULL
      AND (
        (NULLIF(upper(l.nsa_team_code), '') = upper(plf.home_team_code))
        OR (NULLIF(upper(l.nsa_team_code), '') = upper(plf.away_team_code))
        OR (NULLIF(upper(l.code), '') = upper(plf.home_team_code))
        OR (NULLIF(upper(l.code), '') = upper(plf.away_team_code))
      )
    JOIN club_members cm ON cm.club_id = l.club_id AND cm.user_id = auth.uid()
    WHERE plf.id = league_fixture_results.fixture_id
      AND cm.role IN ('admin'::club_member_role, 'captain'::club_member_role)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM platform_league_fixtures plf
    JOIN leagues l ON l.id IS NOT NULL
      AND (
        (NULLIF(upper(l.nsa_team_code), '') = upper(plf.home_team_code))
        OR (NULLIF(upper(l.nsa_team_code), '') = upper(plf.away_team_code))
        OR (NULLIF(upper(l.code), '') = upper(plf.home_team_code))
        OR (NULLIF(upper(l.code), '') = upper(plf.away_team_code))
      )
    JOIN club_members cm ON cm.club_id = l.club_id AND cm.user_id = auth.uid()
    WHERE plf.id = league_fixture_results.fixture_id
      AND cm.role IN ('admin'::club_member_role, 'captain'::club_member_role)
  )
);

-- 6. Fix mutable search_path on common public functions
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND NOT EXISTS (
        SELECT 1 FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) cfg
        WHERE cfg LIKE 'search_path=%'
      )
  LOOP
    BEGIN
      EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path = public', r.nspname, r.proname, r.args);
    EXCEPTION WHEN OTHERS THEN
      -- skip functions we cannot alter (e.g. owned by extensions)
      NULL;
    END;
  END LOOP;
END $$;
