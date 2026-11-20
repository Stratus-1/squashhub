CREATE OR REPLACE FUNCTION public.org_junior_members_for(_org_id uuid, _club_id uuid)
RETURNS TABLE(member_id uuid, name text, gender text, age integer, age_group text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _club_id IS NULL THEN
    RAISE EXCEPTION 'Club required' USING ERRCODE = '22023';
  END IF;
  IF _org_id IS NULL THEN
    IF NOT (public.is_platform_admin(auth.uid()) OR public.is_national_admin(auth.uid())) THEN
      RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NOT public.federation_can_manage_org(auth.uid(), _org_id)
       OR NOT EXISTS (SELECT 1 FROM public.org_grouping_club_ids(_org_id) g WHERE g.club_id = _club_id) THEN
      RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN QUERY
  SELECT x.id, x.name, x.gender, x.age, public.age_group_for_age(x.age)
  FROM (
    SELECT cm.id, cm.name::text AS name, cm.gender::text AS gender,
      COALESCE(
        EXTRACT(YEAR FROM age(CURRENT_DATE, pp.date_of_birth))::int,
        public._agm_age_from_sa_id(COALESCE(pp.id_number, cm.id_number))
      ) AS age
    FROM public.club_members cm
    LEFT JOIN public.people_private pp ON pp.person_id = cm.person_id
    WHERE cm.club_id = _club_id AND cm.status = 'active' AND cm.role <> 'visitor'
  ) x
  WHERE x.age < 19
  ORDER BY x.age, x.name;
END $$;
REVOKE ALL ON FUNCTION public.org_junior_members_for(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_junior_members_for(uuid, uuid) TO authenticated, service_role;