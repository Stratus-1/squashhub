CREATE TABLE public.club_billing_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL UNIQUE REFERENCES public.clubs(id) ON DELETE CASCADE,
  contact_name text,
  company_name text,
  emails text[] NOT NULL DEFAULT '{}',
  phone text,
  address_line1 text,
  address_line2 text,
  city text,
  province text,
  postal_code text,
  country text,
  vat_number text,
  po_number text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_billing_profiles TO authenticated;
GRANT ALL ON public.club_billing_profiles TO service_role;
ALTER TABLE public.club_billing_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Club finance can view billing profile"
ON public.club_billing_profiles FOR SELECT TO authenticated
USING (public.is_club_admin_or_permitted(auth.uid(), club_id, 'finance') OR public.is_platform_admin(auth.uid()));

CREATE POLICY "Club finance can insert billing profile"
ON public.club_billing_profiles FOR INSERT TO authenticated
WITH CHECK (public.is_club_admin_or_permitted(auth.uid(), club_id, 'finance') OR public.is_platform_admin(auth.uid()));

CREATE POLICY "Club finance can update billing profile"
ON public.club_billing_profiles FOR UPDATE TO authenticated
USING (public.is_club_admin_or_permitted(auth.uid(), club_id, 'finance') OR public.is_platform_admin(auth.uid()))
WITH CHECK (public.is_club_admin_or_permitted(auth.uid(), club_id, 'finance') OR public.is_platform_admin(auth.uid()));

CREATE TRIGGER update_club_billing_profiles_updated_at
BEFORE UPDATE ON public.club_billing_profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.club_billing_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  field text NOT NULL,
  old_value text,
  new_value text,
  changed_by uuid,
  changed_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_club_billing_audit_club ON public.club_billing_audit(club_id, created_at DESC);

GRANT SELECT, INSERT ON public.club_billing_audit TO authenticated;
GRANT ALL ON public.club_billing_audit TO service_role;
ALTER TABLE public.club_billing_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Club finance can view billing audit"
ON public.club_billing_audit FOR SELECT TO authenticated
USING (public.is_club_admin_or_permitted(auth.uid(), club_id, 'finance') OR public.is_platform_admin(auth.uid()));

CREATE POLICY "Club finance can insert billing audit"
ON public.club_billing_audit FOR INSERT TO authenticated
WITH CHECK ((public.is_club_admin_or_permitted(auth.uid(), club_id, 'finance') OR public.is_platform_admin(auth.uid())) AND changed_by = auth.uid());