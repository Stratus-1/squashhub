CREATE OR REPLACE FUNCTION public.can_view_tournament_roster(_user_id uuid, _tournament_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    public.is_platform_admin(_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.tournaments t
      WHERE t.id = _tournament_id
        AND (
          public.is_club_member(_user_id, t.club_id)
          OR public.can_manage_tournament(_user_id, t.id)
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.club_champs_registrations r
      JOIN public.club_members cm
        ON cm.id = r.club_member_id OR cm.id = r.partner_member_id
      WHERE r.champ_id = _tournament_id
        AND cm.user_id = _user_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.club_champs_entries e
      JOIN public.club_members cm ON cm.id = e.club_member_id
      WHERE e.champ_id = _tournament_id
        AND cm.user_id = _user_id
    );
$function$;

REVOKE ALL ON FUNCTION public.can_view_tournament_roster(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_tournament_roster(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Club members and entrants view tournament registrations"
ON public.club_champs_registrations;

CREATE POLICY "Club members and entrants view tournament registrations"
ON public.club_champs_registrations
FOR SELECT
TO authenticated
USING (public.can_view_tournament_roster(auth.uid(), champ_id));

DROP POLICY IF EXISTS "Club members and tournament admins can view entries"
ON public.club_champs_entries;

CREATE POLICY "Club members and entrants can view entries"
ON public.club_champs_entries
FOR SELECT
TO authenticated
USING (public.can_view_tournament_roster(auth.uid(), champ_id));