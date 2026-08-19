-- Restrict anonymous read access on public.clubs to public-safe columns only.
REVOKE SELECT ON public.clubs FROM anon;

GRANT SELECT (
  id,
  name,
  subdomain,
  logo_url,
  address,
  email,
  phone,
  tenant_type,
  nsa_club_id,
  chairman_member_id,
  secretary_member_id,
  club_captain_member_id,
  show_delegates_on_landing
) ON public.clubs TO anon;
