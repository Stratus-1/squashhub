-- 1. Slug column on organisations
ALTER TABLE public.organisations ADD COLUMN IF NOT EXISTS slug text;
CREATE UNIQUE INDEX IF NOT EXISTS organisations_slug_key ON public.organisations (slug) WHERE slug IS NOT NULL;

-- 2. Slug generator: unique across organisations.slug and clubs.subdomain
CREATE OR REPLACE FUNCTION public.make_org_slug(_name text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  _base text;
  _slug text;
  _n int := 1;
BEGIN
  _base := lower(coalesce(_name, 'org'));
  _base := translate(_base, 'áàâäãåéèêëíìîïóòôöõúùûüñç', 'aaaaaaeeeeiiiiooooouuuunc');
  _base := regexp_replace(_base, '[^a-z0-9]+', '-', 'g');
  _base := regexp_replace(_base, '(^-+|-+$)', '', 'g');
  _base := regexp_replace(_base, '-+', '-', 'g');
  IF _base = '' THEN _base := 'org'; END IF;
  _base := left(_base, 40);
  _base := regexp_replace(_base, '-+$', '', 'g');
  IF _base IN ('www','app','api','admin','mail','auth','static','assets','cdn','preview','id-preview') THEN
    _base := _base || '-squash';
  END IF;

  _slug := _base;
  WHILE EXISTS (SELECT 1 FROM public.organisations WHERE slug = _slug)
     OR EXISTS (SELECT 1 FROM public.clubs WHERE subdomain = _slug) LOOP
    _n := _n + 1;
    _slug := _base || '-' || _n::text;
  END LOOP;
  RETURN _slug;
END;
$func$;

REVOKE EXECUTE ON FUNCTION public.make_org_slug(text) FROM anon, authenticated;

-- 3. Backfill slugs for existing organisations (reuse tenant subdomain where linked)
DO $do$
DECLARE r record; BEGIN
  FOR r IN SELECT o.id, o.name, c.subdomain
           FROM public.organisations o
           LEFT JOIN public.clubs c ON c.id = o.club_id
           WHERE o.slug IS NULL
           ORDER BY o.created_at LOOP
    IF r.subdomain IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.organisations WHERE slug = r.subdomain) THEN
      UPDATE public.organisations SET slug = r.subdomain WHERE id = r.id;
    ELSE
      UPDATE public.organisations SET slug = public.make_org_slug(r.name) WHERE id = r.id;
    END IF;
  END LOOP;
END $do$;

-- 4. Promote a staged association into the live tree (with slug + tenant workspace)
CREATE OR REPLACE FUNCTION public.promote_sportyhq_association(_org_id uuid, _create_tenant boolean DEFAULT true)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  _s record;
  _parent uuid;
  _new_org uuid;
  _slug text;
  _club uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Platform admin only';
  END IF;

  SELECT * INTO _s FROM public.sportyhq_orgs WHERE id = _org_id AND kind IN ('association','national');
  IF NOT FOUND THEN RAISE EXCEPTION 'Staged association not found'; END IF;
  IF _s.matched_org_id IS NOT NULL THEN RETURN _s.matched_org_id; END IF;

  -- Resolve/create the national parent (Squash South Africa)
  IF _s.kind = 'association' THEN
    SELECT id INTO _parent FROM public.organisations WHERE kind = 'national' AND country = 'ZA' ORDER BY created_at LIMIT 1;
    IF _parent IS NULL THEN
      INSERT INTO public.organisations (name, kind, slug, metadata)
      VALUES ('Squash South Africa', 'national', public.make_org_slug('Squash South Africa'), '{}'::jsonb)
      RETURNING id INTO _parent;
    END IF;
  END IF;

  -- Reuse an existing live organisation with the same name if present
  SELECT id INTO _new_org FROM public.organisations
  WHERE kind = 'association' AND lower(name) = lower(_s.name) LIMIT 1;

  IF _new_org IS NULL THEN
    _slug := public.make_org_slug(_s.name);

    IF _create_tenant AND _s.kind = 'association' THEN
      INSERT INTO public.clubs (name, subdomain, tenant_type)
      VALUES (_s.name, _slug, 'association')
      RETURNING id INTO _club;
    END IF;

    INSERT INTO public.organisations (name, kind, slug, club_id, metadata)
    VALUES (_s.name, CASE WHEN _s.kind = 'national' THEN 'national' ELSE 'association' END, _slug, _club,
            jsonb_build_object('sportyhq_key', _s.sportyhq_org_key))
    RETURNING id INTO _new_org;
  ELSE
    UPDATE public.organisations SET slug = COALESCE(slug, public.make_org_slug(_s.name)) WHERE id = _new_org;
  END IF;

  IF _parent IS NOT NULL THEN
    INSERT INTO public.organisation_relationships (parent_org_id, child_org_id)
    VALUES (_parent, _new_org)
    ON CONFLICT DO NOTHING;
  END IF;

  UPDATE public.sportyhq_orgs
  SET matched_org_id = _new_org, status = 'promoted'
  WHERE id = _org_id;

  -- Point staged clubs of this association at the new live parent
  UPDATE public.sportyhq_orgs
  SET parent_org_id = _new_org
  WHERE kind = 'club' AND parent_key = _s.sportyhq_org_key AND parent_org_id IS NULL;

  RETURN _new_org;
END;
$func$;

-- 5. Bulk promote every staged association
CREATE OR REPLACE FUNCTION public.promote_all_sportyhq_associations(_create_tenants boolean DEFAULT true)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE r record; _count int := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Platform admin only';
  END IF;
  FOR r IN SELECT id FROM public.sportyhq_orgs
           WHERE kind = 'association' AND status <> 'ignored' AND matched_org_id IS NULL
           ORDER BY name LOOP
    PERFORM public.promote_sportyhq_association(r.id, _create_tenants);
    _count := _count + 1;
  END LOOP;
  RETURN _count;
END;
$func$;

-- 6. Club promotion now also creates a slug + tenant workspace
CREATE OR REPLACE FUNCTION public.promote_sportyhq_org(_org_id uuid, _parent_org_id uuid, _club_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  _s record;
  _new_org uuid;
  _club uuid;
  _slug text;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Platform admin only';
  END IF;
  SELECT * INTO _s FROM public.sportyhq_orgs WHERE id = _org_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Staged org not found'; END IF;
  IF _s.matched_org_id IS NOT NULL THEN RETURN _s.matched_org_id; END IF;

  _club := COALESCE(_club_id, _s.matched_club_id);

  -- Reuse an existing organisation already linked to this live club
  IF _club IS NOT NULL THEN
    SELECT id INTO _new_org FROM public.organisations WHERE club_id = _club LIMIT 1;
    SELECT subdomain INTO _slug FROM public.clubs WHERE id = _club;
  END IF;

  IF _new_org IS NULL THEN
    IF _club IS NULL THEN
      -- Create the club workspace so it already exists on the platform
      _slug := public.make_org_slug(_s.name);
      INSERT INTO public.clubs (name, subdomain, tenant_type)
      VALUES (_s.name, _slug, 'club')
      RETURNING id INTO _club;
    ELSIF _slug IS NULL THEN
      _slug := public.make_org_slug(_s.name);
      UPDATE public.clubs SET subdomain = _slug WHERE id = _club AND subdomain IS NULL;
    END IF;

    INSERT INTO public.organisations (name, kind, slug, club_id, metadata)
    VALUES (_s.name, 'club', COALESCE(_slug, public.make_org_slug(_s.name)), _club,
            jsonb_build_object('sportyhq_location', _s.location_label))
    RETURNING id INTO _new_org;
  ELSE
    UPDATE public.organisations SET slug = COALESCE(slug, public.make_org_slug(_s.name)) WHERE id = _new_org;
  END IF;

  IF _parent_org_id IS NOT NULL THEN
    INSERT INTO public.organisation_relationships (parent_org_id, child_org_id)
    VALUES (_parent_org_id, _new_org)
    ON CONFLICT DO NOTHING;
  END IF;

  UPDATE public.sportyhq_orgs
  SET matched_org_id = _new_org,
      matched_club_id = _club,
      parent_org_id = COALESCE(_parent_org_id, parent_org_id),
      status = 'promoted'
  WHERE id = _org_id;

  RETURN _new_org;
END;
$func$;

REVOKE EXECUTE ON FUNCTION public.promote_sportyhq_association(uuid, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.promote_all_sportyhq_associations(boolean) FROM anon;
