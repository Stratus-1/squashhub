ALTER VIEW public.club_champs SET (security_invoker = on);

REVOKE EXECUTE ON FUNCTION public.enforce_bar_tab_pricing() FROM PUBLIC, anon, authenticated;