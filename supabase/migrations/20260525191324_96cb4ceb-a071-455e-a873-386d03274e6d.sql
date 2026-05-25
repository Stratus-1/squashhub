
-- 1. Remove 'captain' from is_club_admin (captain is league-scoped only)
CREATE OR REPLACE FUNCTION public.is_club_admin(_user_id uuid, _club_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.has_role(_user_id, 'admin'::public.app_role)
    OR public.has_role(_user_id, 'moderator'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.club_members
      WHERE user_id = _user_id AND club_id = _club_id AND role = 'admin'
    )
    OR EXISTS (
      SELECT 1
      FROM public.club_member_permissions cmp
      JOIN public.club_members cm ON cm.id = cmp.club_member_id
      WHERE cm.user_id = _user_id
        AND cm.club_id = _club_id
        AND cmp.is_full_admin = true
    );
$function$;

-- 2. Remove 'captain' from is_club_admin_or_permitted
CREATE OR REPLACE FUNCTION public.is_club_admin_or_permitted(_user_id uuid, _club_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.has_role(_user_id, 'admin'::public.app_role)
    OR public.has_role(_user_id, 'moderator'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = _club_id
        AND cm.user_id = _user_id
        AND cm.role = 'admin'
    )
    OR EXISTS (
      SELECT 1
      FROM public.club_members cm
      JOIN public.club_member_permissions cmp ON cmp.club_member_id = cm.id
      LEFT JOIN public.club_permission_roles cpr ON cpr.id = cmp.permission_role_id
      WHERE cm.club_id = _club_id
        AND cm.user_id = _user_id
        AND (
          _permission = ANY(cmp.custom_permissions)
          OR _permission = ANY(cpr.permissions)
        )
    );
$function$;

-- 3. Restrict league_match_results writes to admins/captains
DROP POLICY IF EXISTS "Participating club members can insert match results" ON public.league_match_results;
DROP POLICY IF EXISTS "Participating club members can update match results" ON public.league_match_results;

CREATE POLICY "Participating captains can insert match results"
ON public.league_match_results
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.platform_league_fixtures plf
    JOIN public.leagues l ON (
      (NULLIF(upper(l.nsa_team_code), '') = upper(plf.home_team_code))
      OR (NULLIF(upper(l.nsa_team_code), '') = upper(plf.away_team_code))
      OR (NULLIF(upper(l.code), '') = upper(plf.home_team_code))
      OR (NULLIF(upper(l.code), '') = upper(plf.away_team_code))
    )
    JOIN public.club_members cm ON cm.club_id = l.club_id AND cm.user_id = auth.uid()
    WHERE plf.id = league_match_results.fixture_id
      AND cm.role IN ('admin'::public.club_member_role, 'captain'::public.club_member_role)
  )
);

CREATE POLICY "Participating captains can update match results"
ON public.league_match_results
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.platform_league_fixtures plf
    JOIN public.leagues l ON (
      (NULLIF(upper(l.nsa_team_code), '') = upper(plf.home_team_code))
      OR (NULLIF(upper(l.nsa_team_code), '') = upper(plf.away_team_code))
      OR (NULLIF(upper(l.code), '') = upper(plf.home_team_code))
      OR (NULLIF(upper(l.code), '') = upper(plf.away_team_code))
    )
    JOIN public.club_members cm ON cm.club_id = l.club_id AND cm.user_id = auth.uid()
    WHERE plf.id = league_match_results.fixture_id
      AND cm.role IN ('admin'::public.club_member_role, 'captain'::public.club_member_role)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.platform_league_fixtures plf
    JOIN public.leagues l ON (
      (NULLIF(upper(l.nsa_team_code), '') = upper(plf.home_team_code))
      OR (NULLIF(upper(l.nsa_team_code), '') = upper(plf.away_team_code))
      OR (NULLIF(upper(l.code), '') = upper(plf.home_team_code))
      OR (NULLIF(upper(l.code), '') = upper(plf.away_team_code))
    )
    JOIN public.club_members cm ON cm.club_id = l.club_id AND cm.user_id = auth.uid()
    WHERE plf.id = league_match_results.fixture_id
      AND cm.role IN ('admin'::public.club_member_role, 'captain'::public.club_member_role)
  )
);

-- 4. Scope SELECT on league_match_results to participating club members
-- (Realtime postgres_changes broadcasts respect table RLS, so this prevents cross-club leakage.)
DROP POLICY IF EXISTS "Authenticated users can view league match results" ON public.league_match_results;

CREATE POLICY "Participating club members can view match results"
ON public.league_match_results
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1
    FROM public.platform_league_fixtures plf
    JOIN public.leagues l ON (
      (NULLIF(upper(l.nsa_team_code), '') = upper(plf.home_team_code))
      OR (NULLIF(upper(l.nsa_team_code), '') = upper(plf.away_team_code))
      OR (NULLIF(upper(l.code), '') = upper(plf.home_team_code))
      OR (NULLIF(upper(l.code), '') = upper(plf.away_team_code))
    )
    JOIN public.club_members cm ON cm.club_id = l.club_id AND cm.user_id = auth.uid()
    WHERE plf.id = league_match_results.fixture_id
  )
);

-- 5. Scope SELECT on league_fixture_results to participating club members
DROP POLICY IF EXISTS "Authenticated users can view league fixture results" ON public.league_fixture_results;

CREATE POLICY "Participating club members can view fixture results"
ON public.league_fixture_results
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR EXISTS (
    SELECT 1
    FROM public.platform_league_fixtures plf
    JOIN public.leagues l ON (
      (NULLIF(upper(l.nsa_team_code), '') = upper(plf.home_team_code))
      OR (NULLIF(upper(l.nsa_team_code), '') = upper(plf.away_team_code))
      OR (NULLIF(upper(l.code), '') = upper(plf.home_team_code))
      OR (NULLIF(upper(l.code), '') = upper(plf.away_team_code))
    )
    JOIN public.club_members cm ON cm.club_id = l.club_id AND cm.user_id = auth.uid()
    WHERE plf.id = league_fixture_results.fixture_id
  )
);
