CREATE OR REPLACE FUNCTION public.age_from_id_prefix(_id text)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE yy int; d date; cur int := extract(year from now())::int % 100; a int;
BEGIN
  IF _id IS NULL OR _id !~ '^\d{6}(\d{7})?$' THEN RETURN NULL; END IF;
  yy := substr(_id,1,2)::int;
  BEGIN
    d := make_date(CASE WHEN yy > cur THEN 1900 + yy ELSE 2000 + yy END, substr(_id,3,2)::int, substr(_id,5,2)::int);
  EXCEPTION WHEN others THEN RETURN NULL; END;
  a := extract(year from age(now()::date, d))::int;
  IF a < 0 OR a > 120 THEN RETURN NULL; END IF;
  RETURN a;
END $function$;

CREATE OR REPLACE FUNCTION public.org_junior_members_for(_org_id uuid, _club_id uuid)
 RETURNS TABLE(member_id uuid, name text, gender text, age integer, age_group text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        public.age_from_id_prefix(pp.id_number),
        public.age_from_id_prefix(cm.id_number)
      ) AS age
    FROM public.club_members cm
    LEFT JOIN public.people_private pp ON pp.person_id = cm.person_id
    WHERE cm.club_id = _club_id AND cm.status = 'active' AND cm.role <> 'visitor'
  ) x
  WHERE x.age < 19
  ORDER BY x.age, x.name;
END $function$;

CREATE OR REPLACE FUNCTION public.org_junior_counts()
 RETURNS TABLE(club_id uuid, juniors integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      public.age_from_id_prefix(pp.id_number),
      public.age_from_id_prefix(cm.id_number)
    ) < 19
  GROUP BY cm.club_id;
END $function$;

CREATE OR REPLACE FUNCTION public.org_junior_counts_for(_org_id uuid)
 RETURNS TABLE(club_id uuid, juniors integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.federation_can_manage_org(auth.uid(), _org_id) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT cm.club_id, COUNT(*)::int
  FROM public.club_members cm
  LEFT JOIN public.people_private pp ON pp.person_id = cm.person_id
  WHERE cm.club_id IN (SELECT g.club_id FROM public.org_grouping_club_ids(_org_id) g)
    AND cm.status = 'active' AND cm.role <> 'visitor'
    AND COALESCE(
      EXTRACT(YEAR FROM age(CURRENT_DATE, pp.date_of_birth))::int,
      public.age_from_id_prefix(pp.id_number),
      public.age_from_id_prefix(cm.id_number)
    ) < 19
  GROUP BY cm.club_id;
END $function$;

-- Count of active members at a club with no usable birth date (no DOB, no ID digits). Count only, no names.
CREATE OR REPLACE FUNCTION public.org_club_missing_birth_count_for(_org_id uuid, _club_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE n int;
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
  SELECT COUNT(*)::int INTO n
  FROM public.club_members cm
  LEFT JOIN public.people_private pp ON pp.person_id = cm.person_id
  WHERE cm.club_id = _club_id AND cm.status = 'active' AND cm.role <> 'visitor'
    AND pp.date_of_birth IS NULL
    AND public.age_from_id_prefix(pp.id_number) IS NULL
    AND public.age_from_id_prefix(cm.id_number) IS NULL;
  RETURN n;
END $function$;

REVOKE ALL ON FUNCTION public.org_club_missing_birth_count_for(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_club_missing_birth_count_for(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.age_from_id_prefix(text) TO authenticated, service_role;