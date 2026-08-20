CREATE OR REPLACE FUNCTION public.can_manage_tournament(_tournament_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.can_manage_tournament(auth.uid(), _tournament_id);
$$;

GRANT EXECUTE ON FUNCTION public.can_manage_tournament(uuid) TO authenticated, service_role;