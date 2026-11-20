CREATE TABLE public.junior_player_status (
  person_id uuid PRIMARY KEY REFERENCES public.people(id) ON DELETE CASCADE,
  sportyhq_section text,
  sportyhq_event text,
  sportyhq_age_group text CHECK (sportyhq_age_group IS NULL OR sportyhq_age_group IN ('U11','U13','U15','U17','U19')),
  last_junior_event_on date,
  evidence_checked_at timestamptz,
  admin_state text CHECK (admin_state IS NULL OR admin_state IN ('on','off')),
  admin_set_at timestamptz,
  admin_set_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.junior_player_status TO service_role;
ALTER TABLE public.junior_player_status ENABLE ROW LEVEL SECURITY;
-- No policies: read and written only through the security-definer functions below.
COMMENT ON TABLE public.junior_player_status IS 'Junior squash player tick per person: SportyHQ junior-section evidence plus admin tick/untick. Never stores DOB or ID numbers.';

CREATE OR REPLACE FUNCTION public._junior_band_n(_g text)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _g WHEN 'U11' THEN 11 WHEN 'U13' THEN 13 WHEN 'U15' THEN 15 WHEN 'U17' THEN 17 WHEN 'U19' THEN 19 ELSE NULL END
$$;

-- Evaluates the tick for one person. _known_age = age from birth date / ID (NULL when unknown).
CREATE OR REPLACE FUNCTION public._junior_player_eval(
  _admin_state text, _admin_set_at timestamptz, _last_on date, _group text, _known_age integer,
  OUT is_on boolean, OUT source text, OUT review text)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  recent boolean := _last_on IS NOT NULL AND _last_on >= (CURRENT_DATE - INTERVAL '12 months')::date;
  known_band integer := public._junior_band_n(public.age_group_for_age(_known_age));
BEGIN
  is_on := false; source := NULL; review := NULL;
  IF recent AND _known_age IS NOT NULL AND _known_age < 19 AND _group IS NOT NULL
     AND known_band IS NOT NULL AND known_band > public._junior_band_n(_group) + 2 THEN
    review := 'Age on record (' || _known_age || ') does not fit the SportyHQ ' || _group || ' section played';
  END IF;
  IF _admin_state = 'on' AND _admin_set_at >= now() - INTERVAL '12 months'
     AND (_known_age IS NULL OR _known_age < 19) THEN
    is_on := true; source := 'admin'; RETURN;
  END IF;
  IF _admin_state = 'off' AND (_last_on IS NULL OR _last_on <= (_admin_set_at AT TIME ZONE 'Africa/Johannesburg')::date) THEN
    source := 'admin_removed'; RETURN;
  END IF;
  IF recent AND review IS NULL AND (_known_age IS NULL OR _known_age < 19) THEN
    is_on := true; source := 'sportyhq';
  END IF;
END $$;

-- Service-only writer for SportyHQ junior evidence (called by the SportyHQ history import).
CREATE OR REPLACE FUNCTION public.record_sportyhq_junior_evidence(
  _member_id uuid, _section text, _event text, _age_group text, _last_junior_event_on date)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pid uuid;
BEGIN
  SELECT person_id INTO pid FROM public.club_members WHERE id = _member_id;
  IF pid IS NULL OR _last_junior_event_on IS NULL THEN RETURN false; END IF;
  IF _age_group IS NOT NULL AND _age_group NOT IN ('U11','U13','U15','U17','U19') THEN
    RAISE EXCEPTION 'Invalid age group' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.junior_player_status AS s (person_id, sportyhq_section, sportyhq_event, sportyhq_age_group, last_junior_event_on, evidence_checked_at, updated_at)
  VALUES (pid, left(_section, 200), left(_event, 200), _age_group, _last_junior_event_on, now(), now())
  ON CONFLICT (person_id) DO UPDATE SET
    sportyhq_section = EXCLUDED.sportyhq_section,
    sportyhq_event = EXCLUDED.sportyhq_event,
    sportyhq_age_group = EXCLUDED.sportyhq_age_group,
    last_junior_event_on = GREATEST(s.last_junior_event_on, EXCLUDED.last_junior_event_on),
    evidence_checked_at = now(),
    updated_at = now();
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.record_sportyhq_junior_evidence(uuid, text, text, text, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_sportyhq_junior_evidence(uuid, text, text, text, date) TO service_role;

-- Admin tick / untick. Allowed: platform/national admins, admins of the member's club,
-- or managers of a junior zone/provincial body whose tree contains the club.
CREATE OR REPLACE FUNCTION public.set_junior_player(_member_id uuid, _on boolean, _org_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  m record;
  before_row jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  SELECT id, club_id, person_id, name INTO m FROM public.club_members WHERE id = _member_id;
  IF m.id IS NULL THEN RAISE EXCEPTION 'Member not found' USING ERRCODE = '22023'; END IF;
  IF NOT (
    public.is_platform_admin(uid) OR public.is_national_admin(uid) OR public.is_club_admin(uid, m.club_id)
    OR (_org_id IS NOT NULL AND public.federation_can_manage_org(uid, _org_id)
        AND EXISTS (SELECT 1 FROM public.org_grouping_club_ids(_org_id) g WHERE g.club_id = m.club_id))
  ) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  IF m.person_id IS NULL THEN
    RAISE EXCEPTION 'This member is not linked to a national player record yet' USING ERRCODE = '22023';
  END IF;
  SELECT to_jsonb(s) INTO before_row FROM public.junior_player_status s WHERE s.person_id = m.person_id;
  INSERT INTO public.junior_player_status AS s (person_id, admin_state, admin_set_at, admin_set_by, updated_at)
  VALUES (m.person_id, CASE WHEN _on THEN 'on' ELSE 'off' END, now(), uid, now())
  ON CONFLICT (person_id) DO UPDATE SET admin_state = EXCLUDED.admin_state, admin_set_at = now(), admin_set_by = uid, updated_at = now();
  INSERT INTO public.audit_events (org_id, club_id, actor_user_id, entity_type, entity_id, action, before_data, after_data)
  VALUES (_org_id, m.club_id, uid, 'junior_player', m.person_id,
          CASE WHEN _on THEN 'junior_player_ticked' ELSE 'junior_player_unticked' END,
          before_row, jsonb_build_object('member_id', m.id, 'admin_state', CASE WHEN _on THEN 'on' ELSE 'off' END));
END $$;
REVOKE ALL ON FUNCTION public.set_junior_player(uuid, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_junior_player(uuid, boolean, uuid) TO authenticated, service_role;

-- Junior tree listing: juniors by age plus ticked / review players, with the tick state.
CREATE OR REPLACE FUNCTION public.org_junior_players_for(_org_id uuid, _club_id uuid)
RETURNS TABLE(member_id uuid, name text, gender text, age integer, age_group text,
              junior_player boolean, junior_source text, estimated_group text, sportyhq_section text,
              last_junior_event_on date, review_note text, has_person boolean)
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
  SELECT x.id, x.name, x.gender, x.age, public.age_group_for_age(x.age),
         e.is_on, e.source,
         CASE WHEN x.age IS NULL THEN s.sportyhq_age_group END,
         s.sportyhq_section, s.last_junior_event_on, e.review, x.person_id IS NOT NULL
  FROM (
    SELECT cm.id, cm.person_id, cm.name::text AS name, cm.gender::text AS gender,
      COALESCE(
        EXTRACT(YEAR FROM age(CURRENT_DATE, pp.date_of_birth))::int,
        public.age_from_id_prefix(pp.id_number),
        public.age_from_id_prefix(cm.id_number)
      ) AS age
    FROM public.club_members cm
    LEFT JOIN public.people_private pp ON pp.person_id = cm.person_id
    WHERE cm.club_id = _club_id AND cm.status = 'active' AND cm.role <> 'visitor'
  ) x
  LEFT JOIN public.junior_player_status s ON s.person_id = x.person_id
  CROSS JOIN LATERAL public._junior_player_eval(s.admin_state, s.admin_set_at, s.last_junior_event_on, s.sportyhq_age_group, x.age) e
  WHERE x.age < 19 OR e.is_on OR e.review IS NOT NULL
  ORDER BY COALESCE(x.age, public._junior_band_n(s.sportyhq_age_group) - 1, 99), x.name;
END $$;
REVOKE ALL ON FUNCTION public.org_junior_players_for(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_junior_players_for(uuid, uuid) TO authenticated, service_role;

-- Junior counts: juniors by age OR ticked junior players.
CREATE OR REPLACE FUNCTION public.org_junior_counts()
RETURNS TABLE(club_id uuid, juniors integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.is_platform_admin(auth.uid()) OR public.is_national_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT x.club_id, COUNT(*)::int
  FROM (
    SELECT cm.club_id, cm.person_id,
      COALESCE(
        EXTRACT(YEAR FROM age(CURRENT_DATE, pp.date_of_birth))::int,
        public.age_from_id_prefix(pp.id_number),
        public.age_from_id_prefix(cm.id_number)
      ) AS age
    FROM public.club_members cm
    LEFT JOIN public.people_private pp ON pp.person_id = cm.person_id
    WHERE cm.status = 'active' AND cm.role <> 'visitor'
  ) x
  LEFT JOIN public.junior_player_status s ON s.person_id = x.person_id
  WHERE x.age < 19
     OR (s.person_id IS NOT NULL AND (public._junior_player_eval(s.admin_state, s.admin_set_at, s.last_junior_event_on, s.sportyhq_age_group, x.age)).is_on)
  GROUP BY x.club_id;
END $$;

CREATE OR REPLACE FUNCTION public.org_junior_counts_for(_org_id uuid)
RETURNS TABLE(club_id uuid, juniors integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.federation_can_manage_org(auth.uid(), _org_id) THEN
    RAISE EXCEPTION 'Not allowed' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT x.club_id, COUNT(*)::int
  FROM (
    SELECT cm.club_id, cm.person_id,
      COALESCE(
        EXTRACT(YEAR FROM age(CURRENT_DATE, pp.date_of_birth))::int,
        public.age_from_id_prefix(pp.id_number),
        public.age_from_id_prefix(cm.id_number)
      ) AS age
    FROM public.club_members cm
    LEFT JOIN public.people_private pp ON pp.person_id = cm.person_id
    WHERE cm.club_id IN (SELECT g.club_id FROM public.org_grouping_club_ids(_org_id) g)
      AND cm.status = 'active' AND cm.role <> 'visitor'
  ) x
  LEFT JOIN public.junior_player_status s ON s.person_id = x.person_id
  WHERE x.age < 19
     OR (s.person_id IS NOT NULL AND (public._junior_player_eval(s.admin_state, s.admin_set_at, s.last_junior_event_on, s.sportyhq_age_group, x.age)).is_on)
  GROUP BY x.club_id;
END $$;