-- Junior bodies (zones, provincials, associations grouped under a zone) count their
-- juniors on the public landing page, not their management rows.
CREATE OR REPLACE FUNCTION public._club_junior_body_org(_club_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH RECURSIVE up AS (
    SELECT o.id, o.kind FROM public.organisations o WHERE o.club_id = _club_id
    UNION
    SELECT p.id, p.kind
    FROM up
    JOIN public.org_groupings g ON g.child_org_id = up.id AND g.mode = 'include'
    JOIN public.organisations p ON p.id = g.parent_org_id
  )
  SELECT o.id FROM public.organisations o
  WHERE o.club_id = _club_id
    AND (o.kind IN ('zone','provincial')
         OR EXISTS (SELECT 1 FROM up u WHERE u.kind = 'zone'))
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public._club_junior_body_org(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._club_junior_body_org(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.get_club_is_junior_body(_club_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public._club_junior_body_org(_club_id) IS NOT NULL;
$$;
GRANT EXECUTE ON FUNCTION public.get_club_is_junior_body(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_club_member_count(_club_id uuid)
RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _org uuid := public._club_junior_body_org(_club_id);
BEGIN
  IF _org IS NULL THEN
    RETURN (SELECT COUNT(*)::int FROM public.club_members WHERE club_id = _club_id);
  END IF;
  -- Junior body: count the juniors across its clubs (same rule as the Junior squash board).
  RETURN (
    WITH x AS (
      SELECT cm.id, cm.person_id,
        COALESCE(
          EXTRACT(YEAR FROM age(CURRENT_DATE, pp.date_of_birth))::int,
          public.age_from_id_prefix(pp.id_number),
          public.age_from_id_prefix(cm.id_number)
        ) AS age
      FROM public.club_members cm
      LEFT JOIN public.people_private pp ON pp.person_id = cm.person_id
      WHERE cm.status = 'active' AND cm.role <> 'visitor'
        AND cm.club_id IN (SELECT g.club_id FROM public.org_grouping_club_ids(_org) g)
    )
    SELECT COUNT(*)::int
    FROM x
    LEFT JOIN public.junior_player_status s ON s.person_id = x.person_id
    WHERE x.age < 19
       OR (public._junior_player_eval(s.admin_state, s.admin_set_at, s.last_junior_event_on, s.sportyhq_age_group, x.age)).is_on
  );
END $$;
GRANT EXECUTE ON FUNCTION public.get_club_member_count(uuid) TO anon, authenticated;