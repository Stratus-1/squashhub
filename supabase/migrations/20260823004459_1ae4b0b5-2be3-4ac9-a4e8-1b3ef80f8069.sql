DROP VIEW IF EXISTS public.clubs_public;

CREATE VIEW public.clubs_public
WITH (security_invoker = false, security_barrier = true)
AS
SELECT
  id,
  name,
  logo_url,
  address,
  email,
  phone,
  subdomain,
  tenant_type,
  nsa_club_id,
  chairman_member_id,
  secretary_member_id,
  club_captain_member_id,
  show_delegates_on_landing,
  created_at
FROM public.clubs
WHERE subdomain IS NOT NULL;

ALTER VIEW public.clubs_public OWNER TO postgres;

REVOKE ALL PRIVILEGES ON TABLE public.clubs FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.clubs_public FROM PUBLIC;
REVOKE ALL PRIVILEGES ON TABLE public.clubs_public FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.clubs_public FROM authenticated;
GRANT SELECT ON TABLE public.clubs_public TO anon;
GRANT SELECT ON TABLE public.clubs_public TO authenticated;
GRANT ALL ON TABLE public.clubs_public TO service_role;

DROP POLICY IF EXISTS "Anon may read public landing columns only" ON public.clubs;