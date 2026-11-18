-- Junior (and future) grouping layer: zone -> provincial -> associations/clubs.
-- Kept separate from organisation_relationships so the senior affiliation tree is untouched.
CREATE TABLE public.org_groupings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  child_org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'include' CHECK (mode IN ('include','exclude')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_groupings_no_self CHECK (parent_org_id <> child_org_id),
  CONSTRAINT org_groupings_uniq UNIQUE (parent_org_id, child_org_id)
);
CREATE INDEX org_groupings_child_idx ON public.org_groupings(child_org_id);
GRANT SELECT ON public.org_groupings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_groupings TO authenticated;
GRANT ALL ON public.org_groupings TO service_role;
ALTER TABLE public.org_groupings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org groupings are viewable by everyone" ON public.org_groupings FOR SELECT USING (true);
CREATE POLICY "Platform or national admins manage org groupings" ON public.org_groupings FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.is_national_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()) OR public.is_national_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.trg_org_groupings_validate()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE pk text; ck text;
BEGIN
  SELECT kind::text INTO pk FROM public.organisations WHERE id = NEW.parent_org_id;
  SELECT kind::text INTO ck FROM public.organisations WHERE id = NEW.child_org_id;
  IF pk = 'national' AND ck = 'zone' AND NEW.mode = 'include' THEN RETURN NEW; END IF;
  IF pk = 'zone' AND ck = 'provincial' AND NEW.mode = 'include' THEN RETURN NEW; END IF;
  IF pk = 'provincial' AND ck IN ('association','club') AND NEW.mode = 'include' THEN RETURN NEW; END IF;
  IF pk IN ('provincial','zone') AND ck = 'club' AND NEW.mode = 'exclude' THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'A % cannot be grouped under a % (%)', ck, pk, NEW.mode;
END $$;
CREATE TRIGGER org_groupings_validate BEFORE INSERT OR UPDATE ON public.org_groupings
  FOR EACH ROW EXECUTE FUNCTION public.trg_org_groupings_validate();

-- Every org with a grouping/affiliation move is recorded.
CREATE OR REPLACE FUNCTION public.trg_org_structure_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; act text;
BEGIN
  IF TG_OP = 'DELETE' THEN r := OLD; act := 'remove'; ELSIF TG_OP = 'UPDATE' THEN r := NEW; act := 'move'; ELSE r := NEW; act := 'add'; END IF;
  INSERT INTO public.audit_events(org_id, actor_user_id, entity_type, entity_id, action, before_data, after_data)
  VALUES (r.child_org_id, auth.uid(), TG_TABLE_NAME, r.id, act,
    CASE WHEN TG_OP <> 'INSERT' THEN jsonb_build_object('parent_org_id', OLD.parent_org_id, 'child_org_id', OLD.child_org_id) END,
    CASE WHEN TG_OP <> 'DELETE' THEN jsonb_build_object('parent_org_id', NEW.parent_org_id, 'child_org_id', NEW.child_org_id) END);
  RETURN NULL;
END $$;
CREATE TRIGGER org_groupings_audit AFTER INSERT OR UPDATE OR DELETE ON public.org_groupings
  FOR EACH ROW EXECUTE FUNCTION public.trg_org_structure_audit();
CREATE TRIGGER org_relationships_audit AFTER INSERT OR UPDATE OR DELETE ON public.organisation_relationships
  FOR EACH ROW EXECUTE FUNCTION public.trg_org_structure_audit();

-- All orgs inside a grouping: grouping levels, included associations' affiliation trees, included clubs.
CREATE OR REPLACE FUNCTION public.org_grouping_descendants(_org_id uuid)
RETURNS TABLE(org_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH RECURSIVE g AS (
    SELECT _org_id AS id
    UNION
    SELECT gr.child_org_id FROM public.org_groupings gr JOIN g ON g.id = gr.parent_org_id
    WHERE gr.mode = 'include'
  ),
  levels AS (SELECT g.id FROM g JOIN public.organisations o ON o.id = g.id WHERE o.kind::text IN ('zone','provincial')),
  excluded AS (SELECT gr.child_org_id AS id FROM public.org_groupings gr JOIN levels l ON l.id = gr.parent_org_id WHERE gr.mode = 'exclude'),
  inner_orgs AS (
    SELECT d.org_id FROM g JOIN public.organisations o ON o.id = g.id
    CROSS JOIN LATERAL public.org_descendants(g.id) d
    WHERE o.kind::text IN ('association','club')
  )
  SELECT id FROM levels
  UNION
  SELECT i.org_id FROM inner_orgs i WHERE i.org_id NOT IN (SELECT id FROM excluded);
$$;

CREATE OR REPLACE FUNCTION public.org_grouping_club_ids(_org_id uuid)
RETURNS TABLE(club_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT o.club_id FROM public.org_grouping_descendants(_org_id) d
  JOIN public.organisations o ON o.id = d.org_id
  WHERE o.kind = 'club' AND o.club_id IS NOT NULL;
$$;

-- Grouping admins may view orgs inside their grouping (scope only; club-private data stays protected elsewhere).
CREATE OR REPLACE FUNCTION public.can_view_org(_user_id uuid, _org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organisation_admins a
    WHERE a.user_id = _user_id AND a.active
      AND (_org_id IN (SELECT org_id FROM public.org_descendants(a.org_id))
        OR _org_id IN (SELECT org_id FROM public.org_grouping_descendants(a.org_id)))
  );
$$;

ALTER TABLE public.tournament_governance DROP CONSTRAINT tg_eligibility_scope_check;
ALTER TABLE public.tournament_governance ADD CONSTRAINT tg_eligibility_scope_check
  CHECK (eligibility_scope = ANY (ARRAY['club','association','provincial','zone','open']));

CREATE OR REPLACE FUNCTION public.scope_eligible_club_ids(_club_id uuid, _owner_org_id uuid, _scope text)
 RETURNS TABLE(club_id uuid) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _owner uuid := _owner_org_id;
  _assoc uuid;
  _root uuid;
  _grp uuid;
  _kind text;
BEGIN
  _scope := COALESCE(_scope, 'club');
  IF _owner IS NULL AND _club_id IS NOT NULL THEN
    SELECT o.id INTO _owner FROM public.organisations o
    WHERE o.kind = 'club' AND o.club_id = _club_id LIMIT 1;
    IF _owner IS NULL THEN
      SELECT o.id INTO _owner FROM public.organisations o
      JOIN public.league_associations la ON la.id = o.league_association_id
      JOIN public.clubs c ON c.id = la.tenant_association_id
      WHERE o.kind = 'association' AND c.tenant_type = 'association'
        AND la.tenant_association_id = _club_id LIMIT 1;
    END IF;
  END IF;

  IF _scope = 'club' THEN
    RETURN QUERY SELECT c.id FROM public.clubs c
      WHERE c.id = _club_id OR c.id = (SELECT o.club_id FROM public.organisations o WHERE o.id = _owner);
    RETURN;
  END IF;

  IF _scope IN ('provincial','zone') THEN
    -- Grouping scopes resolve only through an owning zone/provincial organisation; fail closed otherwise.
    SELECT o.kind::text INTO _kind FROM public.organisations o WHERE o.id = _owner;
    IF _kind = 'provincial' AND _scope = 'provincial' THEN _grp := _owner;
    ELSIF _kind = 'zone' AND _scope = 'zone' THEN _grp := _owner;
    ELSIF _kind = 'provincial' AND _scope = 'zone' THEN
      SELECT gr.parent_org_id INTO _grp FROM public.org_groupings gr
      JOIN public.organisations z ON z.id = gr.parent_org_id
      WHERE gr.child_org_id = _owner AND gr.mode = 'include' AND z.kind::text = 'zone' LIMIT 1;
    END IF;
    IF _grp IS NOT NULL THEN
      RETURN QUERY SELECT g.club_id FROM public.org_grouping_club_ids(_grp) g;
    ELSIF _club_id IS NOT NULL THEN
      RETURN QUERY SELECT c.id FROM public.clubs c WHERE c.id = _club_id;
    END IF;
    RETURN;
  END IF;

  IF _scope = 'association' THEN
    SELECT CASE WHEN o.kind = 'association' THEN o.id ELSE public.org_owning_association(_owner) END
      INTO _assoc FROM public.organisations o WHERE o.id = _owner;
    IF _assoc IS NOT NULL THEN
      RETURN QUERY SELECT DISTINCT o.club_id
        FROM public.org_descendants(_assoc) d
        JOIN public.organisations o ON o.id = d.org_id
        WHERE o.kind = 'club' AND o.club_id IS NOT NULL;
    ELSIF _club_id IS NOT NULL THEN
      RETURN QUERY SELECT c.id FROM public.clubs c WHERE c.id = _club_id;
    END IF;
    RETURN;
  END IF;

  _root := public.org_federation_root(_owner);
  RETURN QUERY SELECT DISTINCT o.club_id
    FROM public.org_descendants(_root) d
    JOIN public.organisations o ON o.id = d.org_id
    WHERE o.kind = 'club' AND o.club_id IS NOT NULL
    UNION
    SELECT o.club_id FROM public.organisations o
    WHERE o.kind = 'club' AND o.club_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.organisation_relationships r
        WHERE r.child_org_id = o.id AND (r.effective_to IS NULL OR r.effective_to >= CURRENT_DATE))
    UNION
    SELECT c.id FROM public.clubs c
    WHERE NOT EXISTS (SELECT 1 FROM public.organisations o WHERE o.club_id = c.id);
END;
$function$;

-- One province per season for juniors who are members in more than one province.
CREATE TABLE public.junior_province_choices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  season_year integer NOT NULL,
  provincial_org_id uuid NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  chosen_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT junior_province_choices_uniq UNIQUE (person_id, season_year)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.junior_province_choices TO authenticated;
GRANT ALL ON public.junior_province_choices TO service_role;
ALTER TABLE public.junior_province_choices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Grouping viewers read junior province choices" ON public.junior_province_choices FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.is_national_admin(auth.uid()) OR public.can_view_org(auth.uid(), provincial_org_id));
CREATE POLICY "Platform or national admins manage junior province choices" ON public.junior_province_choices FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.is_national_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()) OR public.is_national_admin(auth.uid()));
CREATE TRIGGER junior_province_choices_updated_at BEFORE UPDATE ON public.junior_province_choices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();