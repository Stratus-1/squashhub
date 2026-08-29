CREATE OR REPLACE FUNCTION public.promote_sportyhq_org(_org_id uuid, _parent_org_id uuid, _club_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  _s record;
  _new_org uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Platform admin only';
  END IF;
  SELECT * INTO _s FROM public.sportyhq_orgs WHERE id = _org_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Staged org not found'; END IF;
  IF _s.matched_org_id IS NOT NULL THEN RETURN _s.matched_org_id; END IF;

  -- Reuse an existing organisation already linked to this live club
  IF COALESCE(_club_id, _s.matched_club_id) IS NOT NULL THEN
    SELECT id INTO _new_org FROM public.organisations
    WHERE club_id = COALESCE(_club_id, _s.matched_club_id)
    LIMIT 1;
  END IF;

  IF _new_org IS NULL THEN
    INSERT INTO public.organisations (name, kind, club_id, metadata)
    VALUES (_s.name, 'club', COALESCE(_club_id, _s.matched_club_id), jsonb_build_object('sportyhq_location', _s.location_label))
    RETURNING id INTO _new_org;
  END IF;

  INSERT INTO public.organisation_relationships (parent_org_id, child_org_id)
  VALUES (_parent_org_id, _new_org)
  ON CONFLICT DO NOTHING;

  UPDATE public.sportyhq_orgs
  SET matched_org_id = _new_org,
      matched_club_id = COALESCE(_club_id, matched_club_id),
      parent_org_id = _parent_org_id,
      status = 'promoted'
  WHERE id = _org_id;

  RETURN _new_org;
END;
$func$;

CREATE OR REPLACE FUNCTION public.promote_sportyhq_org_member(_member_id uuid, _person_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  _m record;
  _person uuid;
  _latest record;
  _season int := EXTRACT(YEAR FROM now())::int;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Platform admin only';
  END IF;
  SELECT * INTO _m FROM public.sportyhq_org_members WHERE id = _member_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Staged member not found'; END IF;

  IF _m.matched_person_id IS NOT NULL THEN
    _person := _m.matched_person_id;
  ELSIF _person_id IS NOT NULL THEN
    _person := _person_id;
  ELSE
    INSERT INTO public.people (full_name, status)
    VALUES (_m.name, 'active')
    RETURNING id INTO _person;
  END IF;

  UPDATE public.sportyhq_profiles
  SET person_id = _person
  WHERE sportyhq_user_id = _m.sportyhq_user_id AND person_id IS NULL;

  -- Mark every staged copy of this player (same SportyHQ ranking slug) as promoted
  UPDATE public.sportyhq_org_members
  SET matched_person_id = _person, status = 'promoted'
  WHERE ranking_slug IS NOT NULL AND ranking_slug = _m.ranking_slug;

  -- Latest-club rule: affiliate the person with the club on their most recently
  -- scraped staging row (some players appear under more than one club).
  SELECT o.matched_org_id INTO _latest
  FROM public.sportyhq_org_members sm
  JOIN public.sportyhq_orgs o ON o.id = sm.org_id
  WHERE sm.ranking_slug = _m.ranking_slug
    AND o.matched_org_id IS NOT NULL
  ORDER BY sm.last_seen_at DESC
  LIMIT 1;

  IF _latest.matched_org_id IS NOT NULL THEN
    -- Move an existing current-season affiliation at another club to the latest club
    UPDATE public.person_affiliations
    SET org_id = _latest.matched_org_id, updated_at = now()
    WHERE person_id = _person
      AND season_year = _season
      AND org_id <> _latest.matched_org_id;

    INSERT INTO public.person_affiliations (person_id, org_id, season_year, affiliation_status, licence_status, billing_enabled)
    SELECT _person, _latest.matched_org_id, _season, 'active', 'none', false
    WHERE NOT EXISTS (
      SELECT 1 FROM public.person_affiliations
      WHERE person_id = _person AND org_id = _latest.matched_org_id AND season_year = _season
    );
  END IF;

  RETURN _person;
END;
$func$;