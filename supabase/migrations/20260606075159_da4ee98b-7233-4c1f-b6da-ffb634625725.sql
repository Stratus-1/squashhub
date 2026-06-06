CREATE OR REPLACE FUNCTION public.is_bells_participant_member(_member_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.club_champs_matches m
    JOIN public.club_champs c ON c.id = m.champ_id
    WHERE c.scoring_mode = 'time_capped_points'
      AND _member_id IN (
        m.player_a_member_id,
        m.player_b_member_id,
        m.partner_a_member_id,
        m.partner_b_member_id,
        m.bye_member_id
      )
  )
  OR EXISTS (
    SELECT 1
    FROM public.club_champs_entries e
    JOIN public.club_champs c ON c.id = e.champ_id
    WHERE c.scoring_mode = 'time_capped_points'
      AND _member_id IN (e.club_member_id, e.partner_member_id)
  )
$$;

REVOKE ALL ON FUNCTION public.is_bells_participant_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_bells_participant_member(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Signed-in users can view Bells participants" ON public.club_members;
CREATE POLICY "Signed-in users can view Bells participants"
ON public.club_members
FOR SELECT
TO authenticated
USING (public.is_bells_participant_member(id));