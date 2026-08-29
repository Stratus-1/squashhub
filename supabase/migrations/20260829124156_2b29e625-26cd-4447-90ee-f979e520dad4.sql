DROP FUNCTION IF EXISTS public.get_public_club_by_subdomain(text);

CREATE OR REPLACE FUNCTION public.get_public_club_by_subdomain(_subdomain text)
 RETURNS TABLE(id uuid, name text, logo_url text, address text, email text, phone text, subdomain text, tenant_type text, nsa_club_id text, chairman_member_id uuid, secretary_member_id uuid, club_captain_member_id uuid, treasurer_member_id uuid, show_delegates_on_landing boolean, visitor_home_clubs_enabled boolean, created_at timestamp with time zone)
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
    COALESCE(c.visitor_home_clubs_enabled, false) AS visitor_home_clubs_enabled,
    c.created_at
  FROM public.clubs AS c
  WHERE c.subdomain = lower(trim(_subdomain))
    AND c.subdomain IS NOT NULL
  LIMIT 1;
$function$;