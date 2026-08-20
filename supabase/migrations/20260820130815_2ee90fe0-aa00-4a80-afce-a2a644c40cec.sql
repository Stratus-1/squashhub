-- Remove anonymous access to the base table entirely.
DROP POLICY IF EXISTS "Public can view basic club info" ON public.clubs;
REVOKE ALL ON public.clubs FROM anon;

-- Public, non-sensitive projection for landing pages / club pickers.
CREATE OR REPLACE VIEW public.clubs_public AS
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
  currency_code,
  currency_symbol,
  created_at
FROM public.clubs;

GRANT SELECT ON public.clubs_public TO anon, authenticated;
