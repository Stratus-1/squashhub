CREATE TABLE public.sportyhq_tree_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  action text NOT NULL,
  sportyhq_org_id uuid,
  association_org_id uuid REFERENCES public.organisations(id),
  status text NOT NULL DEFAULT 'running',
  orgs_found integer NOT NULL DEFAULT 0,
  players_found integer NOT NULL DEFAULT 0,
  message text,
  started_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
GRANT SELECT ON public.sportyhq_tree_runs TO authenticated;
GRANT ALL ON public.sportyhq_tree_runs TO service_role;
ALTER TABLE public.sportyhq_tree_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins read tree runs" ON public.sportyhq_tree_runs FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.sportyhq_orgs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sportyhq_org_key text NOT NULL UNIQUE,
  name text NOT NULL,
  kind text NOT NULL DEFAULT 'club',
  parent_key text,
  parent_org_id uuid REFERENCES public.organisations(id),
  location_label text,
  member_count integer,
  matched_org_id uuid REFERENCES public.organisations(id),
  matched_club_id uuid REFERENCES public.clubs(id),
  status text NOT NULL DEFAULT 'new',
  last_scraped_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sportyhq_orgs TO authenticated;
GRANT ALL ON public.sportyhq_orgs TO service_role;
ALTER TABLE public.sportyhq_orgs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins manage sportyhq orgs" ON public.sportyhq_orgs FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.sportyhq_org_members (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.sportyhq_orgs(id) ON DELETE CASCADE,
  sportyhq_user_id bigint NOT NULL,
  name text NOT NULL,
  profile_path text,
  matched_person_id uuid REFERENCES public.people(id),
  matched_club_member_id uuid REFERENCES public.club_members(id),
  match_confidence text,
  status text NOT NULL DEFAULT 'new',
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, sportyhq_user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sportyhq_org_members TO authenticated;
GRANT ALL ON public.sportyhq_org_members TO service_role;
ALTER TABLE public.sportyhq_org_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admins manage sportyhq org members" ON public.sportyhq_org_members FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_sportyhq_orgs_updated_at BEFORE UPDATE ON public.sportyhq_orgs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_sportyhq_org_members_updated_at BEFORE UPDATE ON public.sportyhq_org_members FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.sportyhq_tree_runs ADD CONSTRAINT sportyhq_tree_runs_org_fk FOREIGN KEY (sportyhq_org_id) REFERENCES public.sportyhq_orgs(id) ON DELETE SET NULL;

-- Promote a scraped club into the federation tree as an organisation node under an association (super admin only)
CREATE OR REPLACE FUNCTION public.promote_sportyhq_org(_org_id uuid, _parent_org_id uuid, _club_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  INSERT INTO public.organisations (name, kind, region)
  VALUES (_s.name, 'club', _s.location_label)
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
$$;

-- Promote a scraped player into a people record and link any existing SportyHQ profile (super admin only)
CREATE OR REPLACE FUNCTION public.promote_sportyhq_org_member(_member_id uuid, _person_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _m record;
  _new_person uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Platform admin only';
  END IF;
  SELECT * INTO _m FROM public.sportyhq_org_members WHERE id = _member_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Staged member not found'; END IF;
  IF _m.matched_person_id IS NOT NULL THEN RETURN _m.matched_person_id; END IF;

  IF _person_id IS NOT NULL THEN
    _new_person := _person_id;
  ELSE
    INSERT INTO public.people (full_name, status)
    VALUES (_m.name, 'active')
    RETURNING id INTO _new_person;
  END IF;

  UPDATE public.sportyhq_profiles
  SET person_id = _new_person
  WHERE sportyhq_user_id = _m.sportyhq_user_id AND person_id IS NULL;

  UPDATE public.sportyhq_org_members
  SET matched_person_id = _new_person, status = 'promoted'
  WHERE id = _member_id;

  RETURN _new_person;
END;
$$;