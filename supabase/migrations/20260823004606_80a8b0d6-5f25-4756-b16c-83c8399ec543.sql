DROP VIEW IF EXISTS public.clubs_public;

CREATE OR REPLACE FUNCTION public.get_public_club_by_subdomain(_subdomain text)
RETURNS TABLE (
  id uuid,
  name text,
  logo_url text,
  address text,
  email text,
  phone text,
  subdomain text,
  tenant_type text,
  nsa_club_id text,
  chairman_member_id uuid,
  secretary_member_id uuid,
  club_captain_member_id uuid,
  show_delegates_on_landing boolean,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.name,
    c.logo_url,
    c.address,
    c.email,
    c.phone,
    c.subdomain,
    c.tenant_type,
    c.nsa_club_id,
    c.chairman_member_id,
    c.secretary_member_id,
    c.club_captain_member_id,
    c.show_delegates_on_landing,
    c.created_at
  FROM public.clubs AS c
  WHERE c.subdomain = lower(trim(_subdomain))
    AND c.subdomain IS NOT NULL
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.list_public_clubs()
RETURNS TABLE (
  id uuid,
  name text,
  logo_url text,
  address text,
  email text,
  phone text,
  subdomain text,
  tenant_type text,
  nsa_club_id text,
  chairman_member_id uuid,
  secretary_member_id uuid,
  club_captain_member_id uuid,
  show_delegates_on_landing boolean,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.name,
    c.logo_url,
    c.address,
    c.email,
    c.phone,
    c.subdomain,
    c.tenant_type,
    c.nsa_club_id,
    c.chairman_member_id,
    c.secretary_member_id,
    c.club_captain_member_id,
    c.show_delegates_on_landing,
    c.created_at
  FROM public.clubs AS c
  WHERE c.subdomain IS NOT NULL
  ORDER BY c.name;
$$;

REVOKE ALL ON FUNCTION public.get_public_club_by_subdomain(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_public_clubs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_club_by_subdomain(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_public_clubs() TO anon, authenticated, service_role;