CREATE OR REPLACE FUNCTION public.promote_sportyhq_org_member(_member_id uuid, _person_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _m record;
  _person uuid;
  _latest record;
  _season int := EXTRACT(YEAR FROM now())::int;
  _gender text;
  _club uuid;
  _cm uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Platform admin only';
  END IF;
  SELECT * INTO _m FROM public.sportyhq_org_members WHERE id = _member_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Staged member not found'; END IF;

  _gender := CASE lower(coalesce(_m.gender, ''))
               WHEN 'male' THEN 'male'
               WHEN 'female' THEN 'female'
               ELSE NULL END;

  IF _m.matched_person_id IS NOT NULL THEN
    _person := _m.matched_person_id;
  ELSIF _person_id IS NOT NULL THEN
    _person := _person_id;
  ELSE
    INSERT INTO public.people (full_name, status, gender, nationality)
    VALUES (_m.name, 'active', _gender, _m.nationality)
    RETURNING id INTO _person;
  END IF;

  UPDATE public.people
  SET gender = COALESCE(gender, _gender),
      nationality = COALESCE(nationality, _m.nationality),
      updated_at = now()
  WHERE id = _person;

  IF _m.date_of_birth IS NOT NULL THEN
    INSERT INTO public.people_private (person_id, date_of_birth)
    VALUES (_person, _m.date_of_birth)
    ON CONFLICT (person_id) DO UPDATE
      SET date_of_birth = COALESCE(public.people_private.date_of_birth, EXCLUDED.date_of_birth),
          updated_at = now();
  END IF;

  UPDATE public.sportyhq_profiles
  SET person_id = _person
  WHERE sportyhq_user_id = _m.sportyhq_user_id AND person_id IS NULL;

  UPDATE public.sportyhq_org_members
  SET matched_person_id = _person, status = 'promoted'
  WHERE ranking_slug IS NOT NULL AND ranking_slug = _m.ranking_slug;

  SELECT o.matched_org_id INTO _latest
  FROM public.sportyhq_org_members sm
  JOIN public.sportyhq_orgs o ON o.id = sm.org_id
  WHERE sm.ranking_slug = _m.ranking_slug
    AND o.matched_org_id IS NOT NULL
  ORDER BY sm.last_seen_at DESC
  LIMIT 1;

  IF _latest.matched_org_id IS NOT NULL THEN
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

  -- Add the player to the club roster when the staged club has a live workspace
  SELECT o.matched_club_id INTO _club
  FROM public.sportyhq_orgs o
  WHERE o.id = _m.org_id AND o.kind = 'club' AND o.matched_club_id IS NOT NULL;

  IF _club IS NOT NULL THEN
    SELECT id INTO _cm FROM public.club_members
    WHERE club_id = _club AND (person_id = _person OR lower(coalesce(name,'')) = lower(_m.name))
    LIMIT 1;

    IF _cm IS NULL THEN
      INSERT INTO public.club_members (club_id, name, gender, person_id, role, status)
      VALUES (_club, _m.name, _gender, _person, 'member', 'active')
      RETURNING id INTO _cm;
    ELSE
      UPDATE public.club_members
      SET person_id = COALESCE(person_id, _person),
          gender = COALESCE(gender, _gender),
          updated_at = now()
      WHERE id = _cm;
    END IF;

    UPDATE public.sportyhq_org_members
    SET matched_club_member_id = _cm
    WHERE id = _m.id;
  END IF;

  RETURN _person;
END;
$fn$;

-- Backfill: promoted staged players under promoted clubs that never got a roster row
DO $$
DECLARE
  r record;
  _cm uuid;
BEGIN
  FOR r IN
    SELECT sm.id, sm.name, sm.gender, sm.matched_person_id, o.matched_club_id
    FROM public.sportyhq_org_members sm
    JOIN public.sportyhq_orgs o ON o.id = sm.org_id
    WHERE sm.status = 'promoted'
      AND sm.matched_club_member_id IS NULL
      AND o.kind = 'club'
      AND o.matched_club_id IS NOT NULL
  LOOP
    SELECT id INTO _cm FROM public.club_members
    WHERE club_id = r.matched_club_id
      AND (person_id = r.matched_person_id OR lower(coalesce(name,'')) = lower(r.name))
    LIMIT 1;

    IF _cm IS NULL THEN
      INSERT INTO public.club_members (club_id, name, gender, person_id, role, status)
      VALUES (r.matched_club_id, r.name,
              CASE lower(coalesce(r.gender,''))
                WHEN 'male' THEN 'male' WHEN 'female' THEN 'female' ELSE NULL END,
              r.matched_person_id, 'member', 'active')
      RETURNING id INTO _cm;
    END IF;

    UPDATE public.sportyhq_org_members SET matched_club_member_id = _cm WHERE id = r.id;
  END LOOP;
END;
$$;