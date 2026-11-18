-- Aggregate junior (under-19) counts per club for the junior structure screen. Returns counts only, never dates of birth.
CREATE OR REPLACE FUNCTION public.org_junior_counts()
RETURNS TABLE(club_id uuid, juniors integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.is_platform_admin(auth.uid()) OR public.is_national_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT cm.club_id, COUNT(*)::int
  FROM public.club_members cm
  LEFT JOIN public.people_private pp ON pp.person_id = cm.person_id
  WHERE cm.status = 'active' AND cm.role <> 'visitor'
    AND COALESCE(
      EXTRACT(YEAR FROM age(CURRENT_DATE, pp.date_of_birth))::int,
      public._agm_age_from_sa_id(COALESCE(pp.id_number, cm.id_number))
    ) < 19
  GROUP BY cm.club_id;
END $$;
REVOKE ALL ON FUNCTION public.org_junior_counts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_junior_counts() TO authenticated, service_role;