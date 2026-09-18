
REVOKE ALL ON FUNCTION public.seed_club_welcome_template(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_seed_club_welcome_template() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_club_welcome_template(uuid) TO service_role;
