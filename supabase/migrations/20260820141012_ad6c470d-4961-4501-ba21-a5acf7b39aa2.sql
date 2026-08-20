-- Restrict organisation_settings SELECT to the same privileged roles that can manage it.
-- The previous policy exposed finance/payout details to every authenticated user.
DROP POLICY IF EXISTS "Authenticated users can view organisation settings" ON public.organisation_settings;

CREATE POLICY "Org admins can view organisation settings"
ON public.organisation_settings FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.is_national_admin(auth.uid())
  OR public.has_org_role(auth.uid(), org_id, 'association_admin')
  OR public.has_org_role(auth.uid(), org_id, 'finance_admin')
  OR public.has_org_role(auth.uid(), org_id, 'super_admin')
);
