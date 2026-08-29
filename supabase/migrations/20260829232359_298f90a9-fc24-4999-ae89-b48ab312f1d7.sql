CREATE OR REPLACE FUNCTION public.search_registerable_clubs(_q text)
RETURNS TABLE(
  id uuid, name text, subdomain text, tenant_type text, region text,
  parent_association text, is_claimable boolean, claim_pending boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT c.id,
         c.name,
         c.subdomain,
         COALESCE(c.tenant_type, 'club') AS tenant_type,
         c.address AS region,
         (
           SELECT po.name
           FROM public.organisations o
           JOIN public.organisation_relationships r ON r.child_org_id = o.id
           JOIN public.organisations po ON po.id = r.parent_org_id
           WHERE o.club_id = c.id AND po.kind = 'association'
           ORDER BY po.name
           LIMIT 1
         ) AS parent_association,
         NOT EXISTS (
           SELECT 1 FROM public.club_members cm
           WHERE cm.club_id = c.id AND cm.role = 'admin' AND cm.user_id IS NOT NULL
         ) AS is_claimable,
         EXISTS (
           SELECT 1 FROM public.club_claim_requests cr
           WHERE cr.club_id = c.id AND cr.status = 'pending'
         ) AS claim_pending
  FROM public.clubs c
  WHERE COALESCE(c.tenant_type, 'club') = 'club'
    AND length(coalesce(_q, '')) >= 2
    AND (c.name ILIKE '%' || _q || '%' OR coalesce(c.address, '') ILIKE '%' || _q || '%' OR coalesce(c.subdomain, '') ILIKE _q || '%')
  ORDER BY (c.name ILIKE _q || '%') DESC, c.name
  LIMIT 20;
$function$;