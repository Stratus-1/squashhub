REVOKE ALL ON public.club_registration_openings FROM anon, authenticated;
GRANT SELECT ON public.club_registration_openings TO authenticated;
GRANT ALL ON public.club_registration_openings TO service_role;