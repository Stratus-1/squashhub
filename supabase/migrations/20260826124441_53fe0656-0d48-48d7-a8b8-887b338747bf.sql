
CREATE TABLE public.club_membership_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL UNIQUE REFERENCES public.clubs(id) ON DELETE CASCADE,
  rules_text text NOT NULL DEFAULT '',
  documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  show_on_landing boolean NOT NULL DEFAULT false,
  require_acceptance boolean NOT NULL DEFAULT true,
  acceptance_statement text NOT NULL DEFAULT 'I confirm I have read and understood the club constitution, house rules and membership rules, and agree to abide by them.',
  current_version integer NOT NULL DEFAULT 1,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_membership_rules TO authenticated;
GRANT SELECT ON public.club_membership_rules TO anon;
GRANT ALL ON public.club_membership_rules TO service_role;

ALTER TABLE public.club_membership_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view their club rules"
  ON public.club_membership_rules FOR SELECT TO authenticated
  USING (public.is_club_member(auth.uid(), club_id) OR show_on_landing = true);

CREATE POLICY "Public view rules flagged for landing"
  ON public.club_membership_rules FOR SELECT TO anon
  USING (show_on_landing = true);

CREATE POLICY "Club admins manage rules"
  ON public.club_membership_rules FOR ALL TO authenticated
  USING (public.is_club_admin(auth.uid(), club_id))
  WITH CHECK (public.is_club_admin(auth.uid(), club_id));

CREATE TABLE public.club_membership_rule_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  version integer NOT NULL,
  rules_text text NOT NULL DEFAULT '',
  documents jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (club_id, version)
);

GRANT SELECT ON public.club_membership_rule_versions TO authenticated;
GRANT ALL ON public.club_membership_rule_versions TO service_role;

ALTER TABLE public.club_membership_rule_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view rule history"
  ON public.club_membership_rule_versions FOR SELECT TO authenticated
  USING (public.is_club_member(auth.uid(), club_id));

CREATE TABLE public.club_rule_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  club_member_id uuid,
  version integer NOT NULL DEFAULT 1,
  statement text NOT NULL DEFAULT '',
  accepted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_club_rule_acceptances_club ON public.club_rule_acceptances (club_id, accepted_at DESC);
CREATE INDEX idx_club_rule_acceptances_user ON public.club_rule_acceptances (user_id);

GRANT SELECT, INSERT ON public.club_rule_acceptances TO authenticated;
GRANT ALL ON public.club_rule_acceptances TO service_role;

ALTER TABLE public.club_rule_acceptances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users record their own acceptance"
  ON public.club_rule_acceptances FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users view own acceptance, admins view club acceptances"
  ON public.club_rule_acceptances FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_club_admin(auth.uid(), club_id));

CREATE OR REPLACE FUNCTION public.club_membership_rules_versioning()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.current_version := 1;
    INSERT INTO public.club_membership_rule_versions (club_id, version, rules_text, documents, created_by)
    VALUES (NEW.club_id, 1, NEW.rules_text, NEW.documents, NEW.updated_by)
    ON CONFLICT (club_id, version) DO NOTHING;
    RETURN NEW;
  END IF;

  NEW.updated_at := now();
  IF NEW.rules_text IS DISTINCT FROM OLD.rules_text
     OR NEW.documents IS DISTINCT FROM OLD.documents THEN
    NEW.current_version := OLD.current_version + 1;
    INSERT INTO public.club_membership_rule_versions (club_id, version, rules_text, documents, created_by)
    VALUES (NEW.club_id, NEW.current_version, NEW.rules_text, NEW.documents, NEW.updated_by)
    ON CONFLICT (club_id, version) DO NOTHING;
  ELSE
    NEW.current_version := OLD.current_version;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_club_membership_rules_versioning
BEFORE INSERT OR UPDATE ON public.club_membership_rules
FOR EACH ROW EXECUTE FUNCTION public.club_membership_rules_versioning();

CREATE OR REPLACE FUNCTION public.get_club_public_membership_rules(_club_id uuid)
RETURNS TABLE (
  rules_text text,
  documents jsonb,
  acceptance_statement text,
  current_version integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.rules_text, r.documents, r.acceptance_statement, r.current_version
  FROM public.club_membership_rules r
  WHERE r.club_id = _club_id
    AND r.show_on_landing = true
    AND (coalesce(r.rules_text, '') <> '' OR jsonb_array_length(r.documents) > 0);
$$;

GRANT EXECUTE ON FUNCTION public.get_club_public_membership_rules(uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_club_membership_rules_for_member(_club_id uuid)
RETURNS TABLE (
  rules_text text,
  documents jsonb,
  acceptance_statement text,
  require_acceptance boolean,
  current_version integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.rules_text, r.documents, r.acceptance_statement, r.require_acceptance, r.current_version
  FROM public.club_membership_rules r
  WHERE r.club_id = _club_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_club_membership_rules_for_member(uuid) TO authenticated;
