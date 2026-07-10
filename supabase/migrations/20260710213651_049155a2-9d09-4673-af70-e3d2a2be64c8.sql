
-- 1. Fix Security Definer View: force club_delegates_public to run as the querying user
ALTER VIEW public.club_delegates_public SET (security_invoker = on);

-- 2. Lock down anonymous access to the clubs table to a safe column subset.
--    Row-level policies still apply; this adds column-level privilege restriction on top.
REVOKE SELECT ON public.clubs FROM anon;

GRANT SELECT (
  id,
  name,
  subdomain,
  logo_url,
  address,
  phone,
  email,
  tenant_type,
  nsa_club_id,
  chairman_member_id,
  secretary_member_id,
  club_captain_member_id,
  contact_person_name,
  show_delegates_on_landing,
  currency_code,
  currency_symbol,
  participation_active,
  visitors_can_book,
  visitor_booking_fee,
  external_booking_provider,
  external_booking_url,
  external_booking_label,
  uses_gobook,
  gobook_url,
  created_at
) ON public.clubs TO anon;
