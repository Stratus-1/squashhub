CREATE OR REPLACE FUNCTION public.my_admin_tenants()
RETURNS TABLE(id uuid, name text, subdomain text, tenant_type text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.name, c.subdomain, c.tenant_type
  FROM public.organisation_admins oa
  JOIN public.organisations o ON o.id = oa.org_id
  JOIN public.clubs c ON c.id = o.club_id
  WHERE oa.user_id = auth.uid()
    AND oa.active = true
    AND c.subdomain IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.my_admin_tenants() FROM public;
GRANT EXECUTE ON FUNCTION public.my_admin_tenants() TO authenticated;