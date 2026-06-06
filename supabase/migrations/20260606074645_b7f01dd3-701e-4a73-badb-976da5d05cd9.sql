CREATE OR REPLACE FUNCTION public.can_mark_bells_match(_user_id uuid, _match_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.club_champs_matches m
      JOIN public.club_champs c ON c.id = m.champ_id
      WHERE m.id = _match_id
        AND c.scoring_mode = 'time_capped_points'
    )
$$;

REVOKE ALL ON FUNCTION public.can_mark_bells_match(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_mark_bells_match(uuid, uuid) TO authenticated, service_role;