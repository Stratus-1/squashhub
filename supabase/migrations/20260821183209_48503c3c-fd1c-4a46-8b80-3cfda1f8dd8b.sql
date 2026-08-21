REVOKE ALL ON FUNCTION public.enforce_confirmed_tournament_division_choice() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_confirmed_tournament_division_choice() FROM anon;
REVOKE ALL ON FUNCTION public.enforce_confirmed_tournament_division_choice() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_confirmed_tournament_division_choice() TO service_role;