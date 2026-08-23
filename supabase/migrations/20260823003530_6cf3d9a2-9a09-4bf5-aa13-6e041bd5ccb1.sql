CREATE OR REPLACE FUNCTION public.can_access_league_fixture(_user_id uuid, _fixture_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_platform_admin(_user_id)
      OR public.has_role(_user_id, 'admin'::app_role)
      OR EXISTS (
        SELECT 1
        FROM public.platform_league_fixtures f
        JOIN public.league_associations la
          ON la.platform_association_id = f.association_id
        WHERE f.id = _fixture_id
          AND (
            public.is_club_member(_user_id, la.club_id)
            OR EXISTS (
              SELECT 1
              FROM public.association_affiliated_clubs aac
              WHERE aac.association_tenant_id = la.club_id
                AND aac.status = 'active'
                AND public.is_club_member(_user_id, aac.club_id)
            )
          )
      );
$$;

GRANT EXECUTE ON FUNCTION public.can_access_league_fixture(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "Authenticated can read marker locks" ON public.league_marker_locks;
CREATE POLICY "Club members and admins can read marker locks"
ON public.league_marker_locks
FOR SELECT
TO authenticated
USING (public.can_access_league_fixture(auth.uid(), fixture_id));

DROP POLICY IF EXISTS "Users update own marker lock or stale" ON public.league_marker_locks;
CREATE POLICY "Users update own marker lock or stale"
ON public.league_marker_locks
FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id
  OR (heartbeat_at < (now() - interval '1 minute')
      AND public.can_access_league_fixture(auth.uid(), fixture_id))
);

DROP POLICY IF EXISTS "Users delete own marker lock or stale" ON public.league_marker_locks;
CREATE POLICY "Users delete own marker lock or stale"
ON public.league_marker_locks
FOR DELETE
TO authenticated
USING (
  auth.uid() = user_id
  OR (heartbeat_at < (now() - interval '1 minute')
      AND public.can_access_league_fixture(auth.uid(), fixture_id))
);