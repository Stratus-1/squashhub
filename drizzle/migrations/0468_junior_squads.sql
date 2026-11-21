CREATE TABLE public.junior_group_placements (
  person_id uuid PRIMARY KEY REFERENCES public.people(id) ON DELETE CASCADE,
  gender_group text CHECK (gender_group IS NULL OR gender_group IN ('boys','girls')),
  age_group text CHECK (age_group IS NULL OR age_group IN ('U11','U13','U15','U17','U19')),
  set_by uuid,
  set_club_id uuid,
  set_org_id uuid,
  set_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.junior_group_placements TO service_role;
ALTER TABLE public.junior_group_placements ENABLE ROW LEVEL SECURITY;
-- No policies: read and written only through the security-definer functions below.
COMMENT ON TABLE public.junior_group_placements IS 'Organiser-chosen junior playing group (drag override). Automatic placement uses current age, else SportyHQ section. Never stores DOB or ID numbers.';

CREATE OR REPLACE FUNCTION public._junior_gender_group(_g text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN lower(coalesce(_g,'')) IN ('men','man','male','m','boy','boys') THEN 'boys'
    WHEN lower(coalesce(_g,'')) IN ('ladies','lady','female','f','women','woman','girl','girls') THEN 'girls'
    ELSE NULL END
$$;

CREATE OR REPLACE FUNCTION public._junior_squads_can_manage(_uid uuid, _club_id uuid, _org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _uid IS NOT NULL AND (
    public.is_platform_admin(_uid) OR public.is_national_admin(_uid)
    OR public.is_club_admin(_uid, _club_id)
    OR public.has_club_permission(_uid, _club_id, 'leagues')
    OR (_org_id IS NOT NULL AND public.federation_can_manage_org(_uid, _org_id)
        AND EXISTS (SELECT 1 FROM public.org_grouping_club_ids(_org_id) g WHERE g.club_id = _club_id))
  )
$$;
REVOKE ALL ON FUNCTION public._junior_squads_can_manage(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._junior_squads_can_manage(uuid, uuid, uuid) TO service_role;

-- Junior squads: one club (club admins / Leagues permission / junior body admins) or a whole junior body tree.
CREATE OR REPLACE FUNCTION public.junior_squads_for(_club_id uuid DEFAULT NULL, _org_id uuid DEFAULT NULL)
RETURNS TABLE(member_id uuid, club_id uuid, club_name text, name text, age integer,
              auto_gender_group text, auto_age_group text, age_source text,
              gender_group text, age_group text, moved boolean,
              junior_player boolean, junior_source text, has_person boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  IF _club_id IS NOT NULL THEN
    IF NOT public._junior_squads_can_manage(uid, _club_id, _org_id) THEN
      RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
    END IF;
  ELSIF _org_id IS NOT NULL THEN
    IF NOT (public.is_platform_admin(uid) OR public.is_national_admin(uid) OR public.federation_can_manage_org(uid, _org_id)) THEN
      RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'Club or junior body required' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  WITH x AS (
    SELECT cm.id, cm.club_id, cm.person_id, cm.name::text AS name, cm.gender::text AS gender,
      COALESCE(
        EXTRACT(YEAR FROM age(CURRENT_DATE, pp.date_of_birth))::int,
        public.age_from_id_prefix(pp.id_number),
        public.age_from_id_prefix(cm.id_number)
      ) AS age
    FROM public.club_members cm
    LEFT JOIN public.people_private pp ON pp.person_id = cm.person_id
    WHERE cm.status = 'active' AND cm.role <> 'visitor'
      AND CASE WHEN _club_id IS NOT NULL THEN cm.club_id = _club_id
               ELSE cm.club_id IN (SELECT g.club_id FROM public.org_grouping_club_ids(_org_id) g) END
  )
  SELECT x.id, x.club_id, c.name::text, x.name, x.age,
    public._junior_gender_group(x.gender),
    CASE WHEN x.age IS NOT NULL AND x.age < 19 THEN public.age_group_for_age(x.age) ELSE s.sportyhq_age_group END,
    CASE WHEN x.age IS NOT NULL AND x.age < 19 THEN 'age' WHEN s.sportyhq_age_group IS NOT NULL THEN 'sportyhq' END,
    COALESCE(p.gender_group, public._junior_gender_group(x.gender)),
    COALESCE(p.age_group, CASE WHEN x.age IS NOT NULL AND x.age < 19 THEN public.age_group_for_age(x.age) ELSE s.sportyhq_age_group END),
    p.person_id IS NOT NULL,
    e.is_on, e.source, x.person_id IS NOT NULL
  FROM x
  JOIN public.clubs c ON c.id = x.club_id
  LEFT JOIN public.junior_player_status s ON s.person_id = x.person_id
  LEFT JOIN public.junior_group_placements p ON p.person_id = x.person_id
  CROSS JOIN LATERAL public._junior_player_eval(s.admin_state, s.admin_set_at, s.last_junior_event_on, s.sportyhq_age_group, x.age) e
  WHERE x.age < 19 OR e.is_on
  ORDER BY x.name;
END $$;
REVOKE ALL ON FUNCTION public.junior_squads_for(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.junior_squads_for(uuid, uuid) TO authenticated, service_role;

-- Move a junior to another playing group, or reset to automatic (both groups NULL). Never changes gender or birth date.
CREATE OR REPLACE FUNCTION public.set_junior_group(_member_id uuid, _gender_group text, _age_group text, _org_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  m record;
  before_row jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  SELECT id, club_id, person_id INTO m FROM public.club_members WHERE id = _member_id;
  IF m.id IS NULL THEN RAISE EXCEPTION 'Member not found' USING ERRCODE = '22023'; END IF;
  IF NOT public._junior_squads_can_manage(uid, m.club_id, _org_id) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  IF m.person_id IS NULL THEN
    RAISE EXCEPTION 'This member is not linked to a national player record yet' USING ERRCODE = '22023';
  END IF;
  IF _gender_group IS NOT NULL AND _gender_group NOT IN ('boys','girls') THEN
    RAISE EXCEPTION 'Invalid group' USING ERRCODE = '22023';
  END IF;
  IF _age_group IS NOT NULL AND _age_group NOT IN ('U11','U13','U15','U17','U19') THEN
    RAISE EXCEPTION 'Invalid age group' USING ERRCODE = '22023';
  END IF;
  SELECT to_jsonb(p) INTO before_row FROM public.junior_group_placements p WHERE p.person_id = m.person_id;
  IF _gender_group IS NULL AND _age_group IS NULL THEN
    DELETE FROM public.junior_group_placements WHERE person_id = m.person_id;
  ELSE
    INSERT INTO public.junior_group_placements AS p (person_id, gender_group, age_group, set_by, set_club_id, set_org_id, set_at)
    VALUES (m.person_id, _gender_group, _age_group, uid, m.club_id, _org_id, now())
    ON CONFLICT (person_id) DO UPDATE SET gender_group = EXCLUDED.gender_group, age_group = EXCLUDED.age_group,
      set_by = uid, set_club_id = m.club_id, set_org_id = _org_id, set_at = now();
  END IF;
  INSERT INTO public.audit_events (org_id, club_id, actor_user_id, entity_type, entity_id, action, before_data, after_data)
  VALUES (_org_id, m.club_id, uid, 'junior_group', m.person_id,
          CASE WHEN _gender_group IS NULL AND _age_group IS NULL THEN 'junior_group_reset' ELSE 'junior_group_moved' END,
          before_row, jsonb_build_object('member_id', m.id, 'gender_group', _gender_group, 'age_group', _age_group));
END $$;
REVOKE ALL ON FUNCTION public.set_junior_group(uuid, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_junior_group(uuid, text, text, uuid) TO authenticated, service_role;