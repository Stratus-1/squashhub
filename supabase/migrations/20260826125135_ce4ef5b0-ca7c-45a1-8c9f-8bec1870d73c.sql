ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS treasurer_member_id UUID REFERENCES public.club_members(id) ON DELETE SET NULL;

DROP FUNCTION public.get_public_club_by_subdomain(text);
CREATE FUNCTION public.get_public_club_by_subdomain(_subdomain text)
RETURNS TABLE(id uuid, name text, logo_url text, address text, email text, phone text, subdomain text, tenant_type text, nsa_club_id text, chairman_member_id uuid, secretary_member_id uuid, club_captain_member_id uuid, treasurer_member_id uuid, show_delegates_on_landing boolean, created_at timestamp with time zone)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    c.treasurer_member_id,
    c.show_delegates_on_landing,
    c.created_at
  FROM public.clubs AS c
  WHERE c.subdomain = lower(trim(_subdomain))
    AND c.subdomain IS NOT NULL
  LIMIT 1;
$function$;
GRANT EXECUTE ON FUNCTION public.get_public_club_by_subdomain(text) TO anon, authenticated;

DROP FUNCTION public.list_public_clubs();
CREATE FUNCTION public.list_public_clubs()
RETURNS TABLE(id uuid, name text, logo_url text, address text, email text, phone text, subdomain text, tenant_type text, nsa_club_id text, chairman_member_id uuid, secretary_member_id uuid, club_captain_member_id uuid, treasurer_member_id uuid, show_delegates_on_landing boolean, created_at timestamp with time zone)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    c.treasurer_member_id,
    c.show_delegates_on_landing,
    c.created_at
  FROM public.clubs AS c
  WHERE c.subdomain IS NOT NULL
  ORDER BY c.name;
$function$;
GRANT EXECUTE ON FUNCTION public.list_public_clubs() TO anon, authenticated;