CREATE OR REPLACE FUNCTION public.get_clubs_with_admins()
RETURNS TABLE(club_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT cm.club_id
  FROM public.club_members cm
  WHERE cm.role = 'admin' AND cm.club_id IS NOT NULL
$$;

GRANT EXECUTE ON FUNCTION public.get_clubs_with_admins() TO anon, authenticated;