-- ============ Phase 1: Federation foundation ============

CREATE TYPE public.org_kind AS ENUM ('national', 'association', 'club');

CREATE TYPE public.org_admin_role AS ENUM (
  'super_admin',
  'competition_admin',
  'finance_admin',
  'association_admin',
  'tournament_director',
  'league_admin',
  'referee'
);

-- ---------- organisations ----------
CREATE TABLE public.organisations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  kind public.org_kind NOT NULL,
  name TEXT NOT NULL,
  abbreviation TEXT,
  country TEXT NOT NULL DEFAULT 'ZA',
  club_id UUID REFERENCES public.clubs(id) ON DELETE CASCADE,
  league_association_id UUID REFERENCES public.league_associations(id) ON DELETE CASCADE,
  platform_association_id UUID REFERENCES public.platform_league_associations(id) ON DELETE SET NULL,
  contact_email TEXT,
  contact_phone TEXT,
  website TEXT,
  logo_url TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX organisations_club_uniq ON public.organisations(club_id) WHERE club_id IS NOT NULL;
CREATE UNIQUE INDEX organisations_assoc_uniq ON public.organisations(league_association_id) WHERE league_association_id IS NOT NULL;
CREATE INDEX organisations_kind_idx ON public.organisations(kind);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organisations TO authenticated;
GRANT SELECT ON public.organisations TO anon;
GRANT ALL ON public.organisations TO service_role;
ALTER TABLE public.organisations ENABLE ROW LEVEL SECURITY;

-- ---------- organisation_relationships ----------
CREATE TABLE public.organisation_relationships (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  parent_org_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  child_org_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL DEFAULT 'affiliation',
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT organisation_relationships_no_self CHECK (parent_org_id <> child_org_id),
  CONSTRAINT organisation_relationships_uniq UNIQUE (parent_org_id, child_org_id, relationship, effective_from)
);
CREATE INDEX org_rel_child_idx ON public.organisation_relationships(child_org_id);
CREATE INDEX org_rel_parent_idx ON public.organisation_relationships(parent_org_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organisation_relationships TO authenticated;
GRANT SELECT ON public.organisation_relationships TO anon;
GRANT ALL ON public.organisation_relationships TO service_role;
ALTER TABLE public.organisation_relationships ENABLE ROW LEVEL SECURITY;

-- ---------- organisation_admins ----------
CREATE TABLE public.organisation_admins (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role public.org_admin_role NOT NULL,
  granted_by UUID,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT organisation_admins_uniq UNIQUE (org_id, user_id, role)
);
CREATE INDEX org_admins_user_idx ON public.organisation_admins(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organisation_admins TO authenticated;
GRANT ALL ON public.organisation_admins TO service_role;
ALTER TABLE public.organisation_admins ENABLE ROW LEVEL SECURITY;

-- ---------- external_ids ----------
CREATE TABLE public.external_ids (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  source_system TEXT NOT NULL,
  external_id TEXT NOT NULL,
  source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT external_ids_uniq UNIQUE (source_system, entity_type, external_id)
);
CREATE INDEX external_ids_entity_idx ON public.external_ids(entity_type, entity_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.external_ids TO authenticated;
GRANT ALL ON public.external_ids TO service_role;
ALTER TABLE public.external_ids ENABLE ROW LEVEL SECURITY;

-- ---------- audit_events ----------
CREATE TABLE public.audit_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID REFERENCES public.organisations(id) ON DELETE SET NULL,
  club_id UUID REFERENCES public.clubs(id) ON DELETE SET NULL,
  actor_user_id UUID,
  actor_label TEXT,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  action TEXT NOT NULL,
  reason TEXT,
  before_data JSONB,
  after_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX audit_events_org_idx ON public.audit_events(org_id, created_at DESC);
CREATE INDEX audit_events_entity_idx ON public.audit_events(entity_type, entity_id);

GRANT SELECT, INSERT ON public.audit_events TO authenticated;
GRANT ALL ON public.audit_events TO service_role;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;

-- ---------- helper functions ----------
CREATE OR REPLACE FUNCTION public.org_descendants(_org_id UUID)
RETURNS TABLE (org_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH RECURSIVE tree AS (
    SELECT _org_id AS id
    UNION
    SELECT r.child_org_id
    FROM public.organisation_relationships r
    JOIN tree t ON t.id = r.parent_org_id
    WHERE r.effective_to IS NULL OR r.effective_to >= CURRENT_DATE
  )
  SELECT id FROM tree;
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(_user_id UUID, _org_id UUID, _role public.org_admin_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organisation_admins a
    WHERE a.user_id = _user_id AND a.org_id = _org_id AND a.role = _role AND a.active
  );
$$;

-- true when the user holds any active federation role at _org_id or at any ancestor of it
CREATE OR REPLACE FUNCTION public.can_view_org(_user_id UUID, _org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organisation_admins a
    WHERE a.user_id = _user_id
      AND a.active
      AND _org_id IN (SELECT org_id FROM public.org_descendants(a.org_id))
  );
$$;

CREATE OR REPLACE FUNCTION public.is_national_admin(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organisation_admins a
    JOIN public.organisations o ON o.id = a.org_id
    WHERE a.user_id = _user_id AND a.active
      AND a.role = 'super_admin' AND o.kind = 'national'
  );
$$;

-- ---------- policies ----------
CREATE POLICY "Organisations are viewable by everyone"
  ON public.organisations FOR SELECT USING (true);
CREATE POLICY "Platform or national admins manage organisations"
  ON public.organisations FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.is_national_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()) OR public.is_national_admin(auth.uid()));

CREATE POLICY "Org relationships are viewable by everyone"
  ON public.organisation_relationships FOR SELECT USING (true);
CREATE POLICY "Platform or national admins manage org relationships"
  ON public.organisation_relationships FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.is_national_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()) OR public.is_national_admin(auth.uid()));

CREATE POLICY "Users see their own federation roles"
  ON public.organisation_admins FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_admin(auth.uid()) OR public.can_view_org(auth.uid(), org_id));
CREATE POLICY "Platform or national admins manage federation roles"
  ON public.organisation_admins FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.is_national_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()) OR public.is_national_admin(auth.uid()));

CREATE POLICY "Federation admins read external ids"
  ON public.external_ids FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.is_national_admin(auth.uid()));
CREATE POLICY "Platform or national admins manage external ids"
  ON public.external_ids FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.is_national_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()) OR public.is_national_admin(auth.uid()));

CREATE POLICY "Admins read audit events in scope"
  ON public.audit_events FOR SELECT TO authenticated
  USING (
    public.is_platform_admin(auth.uid())
    OR (org_id IS NOT NULL AND public.can_view_org(auth.uid(), org_id))
    OR (club_id IS NOT NULL AND public.is_club_admin(auth.uid(), club_id))
  );
CREATE POLICY "Authenticated users write audit events"
  ON public.audit_events FOR INSERT TO authenticated
  WITH CHECK (actor_user_id = auth.uid() OR actor_user_id IS NULL);

-- ---------- updated_at triggers ----------
CREATE TRIGGER update_organisations_updated_at BEFORE UPDATE ON public.organisations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_org_relationships_updated_at BEFORE UPDATE ON public.organisation_relationships
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_org_admins_updated_at BEFORE UPDATE ON public.organisation_admins
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_external_ids_updated_at BEFORE UPDATE ON public.external_ids
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------- seed the hierarchy ----------
INSERT INTO public.organisations (kind, name, abbreviation, country)
VALUES ('national', 'Squash South Africa', 'SSA', 'ZA');

INSERT INTO public.organisations (kind, name, abbreviation, league_association_id, platform_association_id)
SELECT 'association', la.name, la.abbreviation, la.id, la.platform_association_id
FROM public.league_associations la
WHERE la.active
ON CONFLICT DO NOTHING;

INSERT INTO public.organisations (kind, name, club_id)
SELECT 'club', c.name, c.id FROM public.clubs c
ON CONFLICT DO NOTHING;

-- associations under SSA
INSERT INTO public.organisation_relationships (parent_org_id, child_org_id)
SELECT n.id, a.id
FROM public.organisations n
CROSS JOIN public.organisations a
WHERE n.kind = 'national' AND a.kind = 'association'
ON CONFLICT DO NOTHING;

-- clubs under their association where one is known, otherwise under SSA
INSERT INTO public.organisation_relationships (parent_org_id, child_org_id)
SELECT DISTINCT parent.id, child.id
FROM public.organisations child
JOIN public.league_associations la ON la.club_id = child.club_id AND la.active
JOIN public.organisations parent ON parent.league_association_id = la.id
WHERE child.kind = 'club'
ON CONFLICT DO NOTHING;

INSERT INTO public.organisation_relationships (parent_org_id, child_org_id)
SELECT n.id, c.id
FROM public.organisations n
JOIN public.organisations c ON c.kind = 'club'
WHERE n.kind = 'national'
  AND NOT EXISTS (
    SELECT 1 FROM public.organisation_relationships r WHERE r.child_org_id = c.id
  )
ON CONFLICT DO NOTHING;