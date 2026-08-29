
CREATE OR REPLACE FUNCTION public.make_club_slug(_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _base text := '';
  _slug text;
  _n int := 1;
  _words text[];
  _w text;
BEGIN
  _words := regexp_split_to_array(lower(coalesce(_name, 'club')), '[^a-z0-9]+');
  FOREACH _w IN ARRAY _words LOOP
    IF _w = '' OR _w IN ('the','of','and') THEN CONTINUE; END IF;
    _base := _base || left(_w, 1);
  END LOOP;

  -- Too short to be meaningful -> use the first significant word instead
  IF length(_base) < 3 THEN
    _base := '';
    FOREACH _w IN ARRAY _words LOOP
      IF _w = '' OR _w IN ('the','of','and','squash','club') THEN CONTINUE; END IF;
      _base := _w;
      EXIT;
    END LOOP;
    IF coalesce(_base,'') = '' THEN _base := regexp_replace(lower(coalesce(_name,'club')), '[^a-z0-9]+', '', 'g'); END IF;
  END IF;

  _base := left(regexp_replace(_base, '[^a-z0-9]+', '', 'g'), 12);
  IF length(_base) < 2 THEN _base := 'club'; END IF;

  IF _base IN ('www','app','api','admin','mail','auth','static','assets','cdn','preview') THEN
    _base := _base || 'sq';
  END IF;

  _slug := _base;
  WHILE EXISTS (SELECT 1 FROM public.organisations WHERE slug = _slug)
     OR EXISTS (SELECT 1 FROM public.clubs WHERE subdomain = _slug) LOOP
    _n := _n + 1;
    _slug := _base || _n::text;
  END LOOP;
  RETURN _slug;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.make_club_slug(text) FROM anon;

CREATE OR REPLACE FUNCTION public.promote_sportyhq_org(_org_id uuid, _parent_org_id uuid DEFAULT NULL, _club_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _s record;
  _new_org uuid;
  _club uuid;
  _slug text;
  _parent uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Platform admin only';
  END IF;
  SELECT * INTO _s FROM public.sportyhq_orgs WHERE id = _org_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Staged org not found'; END IF;
  IF _s.matched_org_id IS NOT NULL THEN RETURN _s.matched_org_id; END IF;

  _club := COALESCE(_club_id, _s.matched_club_id);
  _parent := _parent_org_id;

  IF _parent IS NULL THEN
    IF _s.parent_org_id IS NOT NULL THEN
      SELECT matched_org_id INTO _parent
      FROM public.sportyhq_orgs
      WHERE id = _s.parent_org_id AND matched_org_id IS NOT NULL;
    END IF;
    IF _parent IS NULL AND _s.parent_key IS NOT NULL THEN
      SELECT matched_org_id INTO _parent
      FROM public.sportyhq_orgs
      WHERE sportyhq_org_key = _s.parent_key AND matched_org_id IS NOT NULL
      LIMIT 1;
    END IF;
    IF _parent IS NULL AND _s.parent_key IS NOT NULL THEN
      SELECT o.id INTO _parent
      FROM public.sportyhq_orgs so
      JOIN public.organisations o ON lower(o.name) = lower(so.name) AND o.kind = 'association'
      WHERE so.sportyhq_org_key = _s.parent_key
      LIMIT 1;
    END IF;
  END IF;

  IF _club IS NOT NULL THEN
    SELECT id INTO _new_org FROM public.organisations WHERE club_id = _club LIMIT 1;
    SELECT subdomain INTO _slug FROM public.clubs WHERE id = _club;
  END IF;

  IF _new_org IS NULL THEN
    IF _club IS NULL THEN
      _slug := public.make_club_slug(_s.name);
      INSERT INTO public.clubs (name, subdomain, tenant_type)
      VALUES (_s.name, _slug, 'club')
      RETURNING id INTO _club;
    ELSIF _slug IS NULL THEN
      _slug := public.make_club_slug(_s.name);
      UPDATE public.clubs SET subdomain = _slug WHERE id = _club AND subdomain IS NULL;
    END IF;

    INSERT INTO public.organisations (name, kind, slug, club_id, metadata)
    VALUES (_s.name, 'club', COALESCE(_slug, public.make_club_slug(_s.name)), _club,
            jsonb_build_object('sportyhq_location', _s.location_label))
    RETURNING id INTO _new_org;
  ELSE
    UPDATE public.organisations SET slug = COALESCE(slug, public.make_club_slug(_s.name)) WHERE id = _new_org;
  END IF;

  IF _parent IS NOT NULL THEN
    INSERT INTO public.organisation_relationships (parent_org_id, child_org_id)
    VALUES (_parent, _new_org)
    ON CONFLICT DO NOTHING;
  END IF;

  UPDATE public.sportyhq_orgs
  SET matched_org_id = _new_org,
      matched_club_id = _club,
      status = 'promoted'
  WHERE id = _org_id;

  RETURN _new_org;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.promote_sportyhq_org(uuid, uuid, uuid) FROM anon;

-- Backfill: rename still-empty auto-created club workspaces to the initials form
DO $do$
DECLARE
  r record;
  _new text;
BEGIN
  FOR r IN
    SELECT o.id AS org_id, o.name, o.slug, c.id AS club_id, c.subdomain
    FROM public.organisations o
    JOIN public.clubs c ON c.id = o.club_id
    WHERE o.kind = 'club'
      AND NOT EXISTS (SELECT 1 FROM public.club_members m WHERE m.club_id = c.id)
      AND NOT EXISTS (SELECT 1 FROM public.courts ct WHERE ct.club_id = c.id)
  LOOP
    _new := public.make_club_slug(r.name);
    IF _new IS DISTINCT FROM r.slug AND left(_new, length(regexp_replace(_new, '[0-9]+$', ''))) IS NOT NULL THEN
      UPDATE public.clubs SET subdomain = _new WHERE id = r.club_id;
      UPDATE public.organisations SET slug = _new WHERE id = r.org_id;
    END IF;
  END LOOP;
END
$do$;
