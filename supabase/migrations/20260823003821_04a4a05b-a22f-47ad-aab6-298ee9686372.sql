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
          AND public.is_club_member(_user_id, t.club_id)
      );
$$;

REVOKE EXECUTE ON FUNCTION public.can_access_champ_match(uuid, uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_champ_match(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Authenticated can view marker locks" ON public.champ_marker_locks;
CREATE POLICY "Club members and admins can view marker locks"
ON public.champ_marker_locks
FOR SELECT
TO authenticated
USING (public.can_access_champ_match(auth.uid(), match_id));

DROP POLICY IF EXISTS "Users can claim a marker lock" ON public.champ_marker_locks;
CREATE POLICY "Users can claim a marker lock"
ON public.champ_marker_locks
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid() AND public.can_access_champ_match(auth.uid(), match_id));

DROP POLICY IF EXISTS "Marker or requester can update lock" ON public.champ_marker_locks;
CREATE POLICY "Marker or requester can update lock"
ON public.champ_marker_locks
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  OR (public.can_access_champ_match(auth.uid(), match_id)
      AND (takeover_requested_by = auth.uid() OR heartbeat_at < (now() - interval '1 minute')))
)
WITH CHECK (
  user_id = auth.uid()
  OR (public.can_access_champ_match(auth.uid(), match_id)
      AND takeover_requested_by = auth.uid())
);

DROP POLICY IF EXISTS "Marker can release own lock" ON public.champ_marker_locks;
CREATE POLICY "Marker can release own lock"
ON public.champ_marker_locks
FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  OR (heartbeat_at < (now() - interval '1 minute')
      AND public.can_access_champ_match(auth.uid(), match_id))
);

REVOKE SELECT, INSERT, UPDATE, DELETE ON public.champ_marker_locks FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.champ_marker_locks TO authenticated;
GRANT ALL ON public.champ_marker_locks TO service_role;