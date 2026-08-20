ALTER VIEW public.clubs_public SET (security_invoker = on);

-- Anonymous visitors may read ONLY the public landing-page columns.
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

CREATE POLICY "Anon may read public landing columns only"
ON public.clubs
FOR SELECT
TO anon
USING (true);
