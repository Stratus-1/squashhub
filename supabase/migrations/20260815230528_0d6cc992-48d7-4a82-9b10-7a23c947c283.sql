CREATE TABLE public.organisation_settings (
  org_id UUID PRIMARY KEY REFERENCES public.organisations(id) ON DELETE CASCADE,
  default_entry_fee_cents INTEGER NOT NULL DEFAULT 0,
  default_federation_fee_cents INTEGER NOT NULL DEFAULT 0,
  default_association_fee_cents INTEGER NOT NULL DEFAULT 0,
  default_host_share_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  require_sanctioning BOOLEAN NOT NULL DEFAULT false,
  require_competitive_licence BOOLEAN NOT NULL DEFAULT false,
  payout_reference TEXT,
  finance_contact_name TEXT,
  finance_contact_email TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organisation_settings TO authenticated;
GRANT ALL ON public.organisation_settings TO service_role;

ALTER TABLE public.organisation_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view organisation settings"
ON public.organisation_settings FOR SELECT TO authenticated USING (true);

CREATE POLICY "Org admins can manage organisation settings"
ON public.organisation_settings FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.is_national_admin(auth.uid())
  OR public.has_org_role(auth.uid(), org_id, 'association_admin')
  OR public.has_org_role(auth.uid(), org_id, 'finance_admin')
  OR public.has_org_role(auth.uid(), org_id, 'super_admin')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.is_national_admin(auth.uid())
  OR public.has_org_role(auth.uid(), org_id, 'association_admin')
  OR public.has_org_role(auth.uid(), org_id, 'finance_admin')
  OR public.has_org_role(auth.uid(), org_id, 'super_admin')
);

CREATE TRIGGER update_organisation_settings_updated_at
BEFORE UPDATE ON public.organisation_settings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Org admins can view their organisation admins"
ON public.organisation_admins FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
  OR public.is_national_admin(auth.uid())
  OR public.has_org_role(auth.uid(), org_id, 'association_admin')
  OR public.has_org_role(auth.uid(), org_id, 'super_admin')
);

CREATE POLICY "Org admins can manage their organisation admins"
ON public.organisation_admins FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.is_national_admin(auth.uid())
  OR public.has_org_role(auth.uid(), org_id, 'association_admin')
  OR public.has_org_role(auth.uid(), org_id, 'super_admin')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.is_national_admin(auth.uid())
  OR public.has_org_role(auth.uid(), org_id, 'association_admin')
  OR public.has_org_role(auth.uid(), org_id, 'super_admin')
);