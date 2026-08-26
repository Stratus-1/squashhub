ALTER VIEW public.club_champs SET (security_invoker = true);

COMMENT ON VIEW public.club_champs IS 'Compatibility view over tournaments. SECURITY INVOKER ensures underlying tournament, governance, and rules RLS policies are evaluated for the calling user.';