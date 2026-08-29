CREATE OR REPLACE FUNCTION public.promote_sportyhq_association(_org_id uuid, _create_tenant boolean DEFAULT true)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      VALUES ('Squash South Africa', 'national'::org_kind, public.make_org_slug('Squash South Africa'), '{}'::jsonb)
      RETURNING id INTO _parent;
    END IF;
  END IF;

  SELECT id INTO _new_org FROM public.organisations
  WHERE kind = 'association'::org_kind AND lower(name) = lower(_s.name) LIMIT 1;

  IF _new_org IS NULL THEN
    _slug := public.make_org_slug(_s.name);

    IF _create_tenant AND _s.kind = 'association' THEN
      INSERT INTO public.clubs (name, subdomain, tenant_type)
      VALUES (_s.name, _slug, 'association')
      RETURNING id INTO _club;
    END IF;

    INSERT INTO public.organisations (name, kind, slug, club_id, metadata)
    VALUES (_s.name,
            (CASE WHEN _s.kind = 'national' THEN 'national' ELSE 'association' END)::org_kind,
            _slug, _club,
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
$$;