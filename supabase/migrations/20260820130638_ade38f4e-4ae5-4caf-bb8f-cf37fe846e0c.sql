-- Restrict anonymous SELECT on public.clubs to non-sensitive, public landing-page columns.
REVOKE SELECT ON public.clubs FROM anon;

GRANT SELECT (
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
  currency_code,
  currency_symbol,
  created_at
) ON public.clubs TO anon;
