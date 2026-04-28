CREATE OR REPLACE FUNCTION public.get_club_member_count(_club_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int
  FROM public.club_members
  WHERE club_id = _club_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_club_member_count(uuid) TO anon, authenticated;