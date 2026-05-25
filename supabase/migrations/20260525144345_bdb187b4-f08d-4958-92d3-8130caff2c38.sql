
CREATE OR REPLACE FUNCTION public.get_champ_host(_champ_id uuid)
RETURNS TABLE (subdomain text, club_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.subdomain, c.name
  FROM public.club_champs cc
  JOIN public.clubs c ON c.id = cc.club_id
  WHERE cc.id = _champ_id
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_champ_host(uuid) TO anon, authenticated;
