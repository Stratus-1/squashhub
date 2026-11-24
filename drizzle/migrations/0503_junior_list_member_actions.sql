ALTER TABLE public.junior_player_status ADD COLUMN IF NOT EXISTS removed_from_list boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.set_junior_list_state(_member_id uuid, _state text, _org_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE uid uuid := auth.uid(); m record; before_row jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE='42501'; END IF;
  IF _state NOT IN ('playing','not_playing','removed','auto') THEN RAISE EXCEPTION 'Unknown choice' USING ERRCODE='22023'; END IF;
  SELECT id, club_id, person_id INTO m FROM public.club_members WHERE id=_member_id;
  IF m.id IS NULL THEN RAISE EXCEPTION 'Member not found' USING ERRCODE='22023'; END IF;
  IF NOT public._junior_squads_can_manage(uid, m.club_id, _org_id) THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE='42501'; END IF;
  IF m.person_id IS NULL THEN RAISE EXCEPTION 'This member is not linked to a national player record yet' USING ERRCODE='22023'; END IF;
  SELECT to_jsonb(s) INTO before_row FROM public.junior_player_status s WHERE s.person_id=m.person_id;
  INSERT INTO public.junior_player_status AS s (person_id, admin_state, admin_set_at, admin_set_by, removed_from_list, updated_at)
  VALUES (m.person_id,
    CASE _state WHEN 'playing' THEN 'on' WHEN 'auto' THEN NULL ELSE 'off' END,
    CASE WHEN _state='auto' THEN NULL ELSE now() END,
    CASE WHEN _state='auto' THEN NULL ELSE uid END,
    _state='removed', now())
  ON CONFLICT (person_id) DO UPDATE SET admin_state=EXCLUDED.admin_state, admin_set_at=EXCLUDED.admin_set_at,
    admin_set_by=EXCLUDED.admin_set_by, removed_from_list=EXCLUDED.removed_from_list, updated_at=now();
  INSERT INTO public.audit_events (org_id, club_id, actor_user_id, entity_type, entity_id, action, before_data, after_data)
  VALUES (_org_id, m.club_id, uid, 'junior_player', m.person_id, 'junior_list_'||_state, before_row,
    jsonb_build_object('member_id', m.id, 'state', _state));
END $$;
REVOKE ALL ON FUNCTION public.set_junior_list_state(uuid,text,uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_junior_list_state(uuid,text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.junior_state_for_member(_member_id uuid)
RETURNS TABLE(has_person boolean, admin_state text, removed boolean, is_on boolean, source text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE uid uuid := auth.uid(); m record;
BEGIN
  SELECT id, club_id, person_id INTO m FROM public.club_members WHERE id=_member_id;
  IF m.id IS NULL OR NOT public._junior_squads_can_manage(uid, m.club_id, NULL) THEN RAISE EXCEPTION 'Not allowed' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT m.person_id IS NOT NULL, s.admin_state, COALESCE(s.removed_from_list,false), e.is_on, e.source
  FROM (SELECT 1) one
  LEFT JOIN public.junior_player_status s ON s.person_id=m.person_id
  CROSS JOIN LATERAL public._junior_player_eval(s.admin_state, s.admin_set_at, s.last_junior_event_on, s.sportyhq_age_group, NULL) e;
END $$;
REVOKE ALL ON FUNCTION public.junior_state_for_member(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.junior_state_for_member(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.junior_squads_for(_club_id uuid DEFAULT NULL::uuid, _org_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(member_id uuid, club_id uuid, club_name text, name text, age integer, auto_gender_group text, auto_age_group text, age_source text, gender_group text, age_group text, moved boolean, junior_player boolean, junior_source text, has_person boolean)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
  WHERE (x.age < 19 OR e.is_on) AND NOT COALESCE(s.removed_from_list, false)
  ORDER BY x.name;
END $function$;