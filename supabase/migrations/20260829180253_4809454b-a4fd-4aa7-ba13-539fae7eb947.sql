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

  INSERT INTO public.organisations (name, kind, club_id, metadata)
  VALUES (_s.name, 'club', COALESCE(_club_id, _s.matched_club_id), jsonb_build_object('sportyhq_location', _s.location_label))
  RETURNING id INTO _new_org;

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