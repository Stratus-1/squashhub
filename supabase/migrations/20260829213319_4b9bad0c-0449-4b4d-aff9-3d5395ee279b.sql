CREATE OR REPLACE FUNCTION public.promote_sportyhq_org(_org_id uuid, _parent_org_id uuid DEFAULT NULL, _club_id uuid DEFAULT NULL)
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

  -- Auto-allocate under the already-promoted association for this staged club
  IF _parent IS NULL THEN
    -- 1) Via the staged parent association row, if it was promoted
    IF _s.parent_org_id IS NOT NULL THEN
      SELECT matched_org_id INTO _parent
      FROM public.sportyhq_orgs
      WHERE id = _s.parent_org_id AND matched_org_id IS NOT NULL;
    END IF;
    -- 2) Via the staged parent key (sportyhq org key of the association)
    IF _parent IS NULL AND _s.parent_key IS NOT NULL THEN
      SELECT matched_org_id INTO _parent
      FROM public.sportyhq_orgs
      WHERE sportyhq_org_key = _s.parent_key AND matched_org_id IS NOT NULL
      LIMIT 1;
    END IF;
    -- 3) Fallback: match a live association organisation by name
    IF _parent IS NULL AND _s.parent_key IS NOT NULL THEN
      SELECT o.id INTO _parent
      FROM public.sportyhq_orgs so
      JOIN public.organisations o ON lower(o.name) = lower(so.name) AND o.kind = 'association'
      WHERE so.sportyhq_org_key = _s.parent_key
      LIMIT 1;
    END IF;
  END IF;

  -- Reuse an existing organisation already linked to this live club
  IF _club IS NOT NULL THEN
    SELECT id INTO _new_org FROM public.organisations WHERE club_id = _club LIMIT 1;
    SELECT subdomain INTO _slug FROM public.clubs WHERE id = _club;
  END IF;

  IF _new_org IS NULL THEN
    IF _club IS NULL THEN
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
$func$;

REVOKE EXECUTE ON FUNCTION public.promote_sportyhq_org(uuid, uuid, uuid) FROM anon;