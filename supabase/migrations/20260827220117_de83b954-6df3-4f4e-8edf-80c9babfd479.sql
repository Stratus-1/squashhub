CREATE OR REPLACE FUNCTION public.is_association_admin(_user_id uuid, _tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_club_admin(_user_id, _tenant_id)
    OR public.has_role(_user_id, 'admin'::app_role)
    OR EXISTS (
      SELECT 1
      FROM public.organisation_admins oa
      JOIN public.organisations o ON o.id = oa.org_id
      JOIN public.league_associations la ON la.id = o.league_association_id
      WHERE oa.user_id = _user_id
        AND oa.active = true
        AND la.tenant_association_id = _tenant_id
    );
$$;