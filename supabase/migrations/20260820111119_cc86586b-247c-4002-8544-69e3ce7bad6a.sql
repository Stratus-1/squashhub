ALTER VIEW public.club_champs SET (security_invoker = on);
COMMENT ON VIEW public.club_champs IS 'Compatibility view over tournaments with security invoker enabled.';