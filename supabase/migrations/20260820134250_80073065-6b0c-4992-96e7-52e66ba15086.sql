REVOKE ALL ON FUNCTION public.ensure_tournament_invite_tokens(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_tournament_invite_tokens(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.enforce_tournament_eligibility() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_tournament_eligibility() TO service_role;