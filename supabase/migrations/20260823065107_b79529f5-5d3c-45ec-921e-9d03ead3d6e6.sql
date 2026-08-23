CREATE OR REPLACE FUNCTION public.can_access_champ_match(_user_id uuid, _match_id uuid)
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
        FROM public.club_champs_matches m
        JOIN public.tournaments t ON t.id = m.champ_id
        WHERE m.id = _match_id
          AND (
            public.is_club_member(_user_id, t.club_id)
            OR public.can_manage_tournament(_user_id, t.id)
            OR public.can_view_tournament(_user_id, t.id)
            OR EXISTS (
              SELECT 1 FROM public.club_members cm
              WHERE cm.user_id = _user_id
                AND cm.id IN (m.player_a_member_id, m.player_b_member_id,
                              m.partner_a_member_id, m.partner_b_member_id)
            )
          )
      );
$$;

REVOKE EXECUTE ON FUNCTION public.can_access_champ_match(uuid, uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_champ_match(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Users insert own marker lock" ON public.league_marker_locks;
CREATE POLICY "Users insert own marker lock"
ON public.league_marker_locks
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND public.can_access_league_fixture(auth.uid(), fixture_id)
);