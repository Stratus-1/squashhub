CREATE OR REPLACE FUNCTION public.is_club_captain(_user_id uuid, _club_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.club_members m
    WHERE m.user_id = _user_id
      AND m.club_id = _club_id
      AND m.role = 'captain'::public.club_member_role
  )
$$;

REVOKE ALL ON FUNCTION public.is_club_captain(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.is_club_captain(uuid, uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Club members can score tournament matches" ON public.club_champs_matches;

CREATE POLICY "Participants captains and admins can score tournament matches"
ON public.club_champs_matches
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.tournaments c
    WHERE c.id = club_champs_matches.champ_id
      AND (
        public.is_club_admin_or_permitted(auth.uid(), c.club_id, 'champs'::text)
        OR public.is_club_captain(auth.uid(), c.club_id)
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.is_member_owner(club_champs_matches.player_a_member_id)
        OR public.is_member_owner(club_champs_matches.player_b_member_id)
        OR public.is_member_owner(club_champs_matches.partner_a_member_id)
        OR public.is_member_owner(club_champs_matches.partner_b_member_id)
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.tournaments c
    WHERE c.id = club_champs_matches.champ_id
      AND (
        public.is_club_admin_or_permitted(auth.uid(), c.club_id, 'champs'::text)
        OR public.is_club_captain(auth.uid(), c.club_id)
        OR public.has_role(auth.uid(), 'admin'::public.app_role)
        OR public.is_member_owner(club_champs_matches.player_a_member_id)
        OR public.is_member_owner(club_champs_matches.player_b_member_id)
        OR public.is_member_owner(club_champs_matches.partner_a_member_id)
        OR public.is_member_owner(club_champs_matches.partner_b_member_id)
      )
  )
);