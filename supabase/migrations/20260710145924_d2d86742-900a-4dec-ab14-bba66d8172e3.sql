DROP POLICY IF EXISTS "Signed-in users can view Bells participants" ON public.club_members;

CREATE OR REPLACE FUNCTION public.get_bells_participant_min(_member_ids uuid[])
RETURNS TABLE (id uuid, user_id uuid, club_id uuid, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cm.id, cm.user_id, cm.club_id, cm.name
  FROM public.club_members cm
  WHERE cm.id = ANY(_member_ids)
    AND public.is_bells_participant_member(cm.id);
$$;

REVOKE ALL ON FUNCTION public.get_bells_participant_min(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_bells_participant_min(uuid[]) TO authenticated;