-- 1. Short-acronym slug generator (replaces the long kebab-case one)
-- "Mpumalanga East Squash Association" -> mpea, "Squash South Africa" -> ssa
CREATE OR REPLACE FUNCTION public.make_org_slug(_name text, _abbrev text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  _base text;
  _slug text;
  _n int := 1;
  _words text[];
  _w text;
  _first boolean := true;
BEGIN
  -- Prefer an explicit abbreviation when available
  _base := lower(trim(coalesce(nullif(_abbrev, ''), '')));

  IF _base = '' THEN
    IF lower(trim(coalesce(_name, ''))) = 'squash south africa' THEN
      _base := 'ssa';
    ELSE
      _base := '';
      _words := regexp_split_to_array(lower(coalesce(_name, 'org')), '[^a-z0-9]+');
      FOREACH _w IN ARRAY _words LOOP
        IF _w = '' OR _w IN ('squash', 'the', 'of', 'and') THEN CONTINUE; END IF;
        IF _first THEN
          _base := _base || left(_w, 2);
          _first := false;
        ELSE
          _base := _base || left(_w, 1);
        END IF;
      END LOOP;
    END IF;
  END IF;

  _base := regexp_replace(_base, '[^a-z0-9]+', '', 'g');
  IF length(_base) < 2 THEN
    -- Fall back to a kebab slug when the acronym would be meaningless
    _base := lower(coalesce(_name, 'org'));
    _base := translate(_base, 'áàâäãåéèêëíìîïóòôöõúùûüñç', 'aaaaaaeeeeiiiiooooouuuunc');
    _base := regexp_replace(_base, '[^a-z0-9]+', '-', 'g');
    _base := regexp_replace(_base, '(^-+|-+$)', '', 'g');
    _base := left(_base, 40);
  END IF;
  _base := left(_base, 12);

  IF _base IN ('www','app','api','admin','mail','auth','static','assets','cdn','preview','id-preview') THEN
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
$func$;

REVOKE EXECUTE ON FUNCTION public.make_org_slug(text, text) FROM anon, authenticated;
DROP FUNCTION IF EXISTS public.make_org_slug(text);

-- 2. Backfill: rename long auto-generated slugs to short acronyms.
-- Only touches rows where the org slug and tenant subdomain still match (auto-created together)
-- and the workspace has no members yet, so nothing live is disturbed.
DO $do$
DECLARE
  r record;
  _new text;
BEGIN
  FOR r IN
    SELECT o.id AS org_id, o.name, o.abbreviation, o.slug AS old_slug, c.id AS club_id, c.subdomain
    FROM public.organisations o
    LEFT JOIN public.clubs c ON c.id = o.club_id
    WHERE o.slug IS NOT NULL
      AND (length(o.slug) > 8 OR o.slug LIKE '%-%')
      AND (c.id IS NULL OR (c.subdomain = o.slug AND NOT EXISTS (SELECT 1 FROM public.club_members m WHERE m.club_id = c.id)))
    ORDER BY o.created_at
  LOOP
    -- free the old slug so the generator can consider the base form
    UPDATE public.organisations SET slug = NULL WHERE id = r.org_id;
    IF r.club_id IS NOT NULL THEN
      UPDATE public.clubs SET subdomain = NULL WHERE id = r.club_id;
    END IF;

    _new := public.make_org_slug(r.name, r.abbreviation);

    UPDATE public.organisations SET slug = _new WHERE id = r.org_id;
    IF r.club_id IS NOT NULL THEN
      UPDATE public.clubs SET subdomain = _new WHERE id = r.club_id;
    END IF;
  END LOOP;
END $do$;

-- 3. Promotion functions pass abbreviation through to the generator
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

  IF _s.kind = 'association' THEN
    SELECT id INTO _parent FROM public.organisations WHERE kind = 'national' AND country = 'ZA' ORDER BY created_at LIMIT 1;
    IF _parent IS NULL THEN
      INSERT INTO public.organisations (name, kind, slug, metadata)
      VALUES ('Squash South Africa', 'national', public.make_org_slug('Squash South Africa'), '{}'::jsonb)
      RETURNING id INTO _parent;
    END IF;
  END IF;

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

  UPDATE public.sportyhq_orgs
  SET parent_org_id = _new_org
  WHERE kind = 'club' AND parent_key = _s.sportyhq_org_key AND parent_org_id IS NULL;

  RETURN _new_org;
END;
$func$;

REVOKE EXECUTE ON FUNCTION public.promote_sportyhq_association(uuid, boolean) FROM anon;