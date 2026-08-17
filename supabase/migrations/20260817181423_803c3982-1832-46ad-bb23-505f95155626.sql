REVOKE EXECUTE ON FUNCTION public.club_gateway_fee_percent(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.post_gateway_fee(uuid, uuid, numeric, text, uuid) FROM anon, authenticated;