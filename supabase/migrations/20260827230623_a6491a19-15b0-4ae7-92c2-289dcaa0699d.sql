CREATE OR REPLACE FUNCTION public.is_platform_association_admin(_user_id uuid, _platform_association_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _platform_association_id IS NOT NULL AND (
    public.has_role(_user_id, 'admin'::app_role)
    OR EXISTS (
      SELECT 1
      FROM public.organisation_admins oa
      JOIN public.organisations o ON o.id = oa.org_id
      WHERE oa.user_id = _user_id
        AND oa.active = true
        AND o.platform_association_id = _platform_association_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.organisation_admins oa
      JOIN public.organisations o ON o.id = oa.org_id
      JOIN public.league_associations la ON la.id = o.league_association_id
      WHERE oa.user_id = _user_id
        AND oa.active = true
        AND la.platform_association_id = _platform_association_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.league_associations la
      WHERE la.platform_association_id = _platform_association_id
        AND la.tenant_association_id IS NOT NULL
        AND public.is_association_admin(_user_id, la.tenant_association_id)
    )
  );
$$;

DROP POLICY IF EXISTS "Association admins manage their league rules" ON public.league_rules;
CREATE POLICY "Association admins manage their league rules"
ON public.league_rules
FOR ALL
TO authenticated
USING (association_id IS NOT NULL AND public.is_platform_association_admin(auth.uid(), association_id))
WITH CHECK (association_id IS NOT NULL AND public.is_platform_association_admin(auth.uid(), association_id));

DROP POLICY IF EXISTS "Association admins manage their fixtures" ON public.platform_league_fixtures;
CREATE POLICY "Association admins manage their fixtures"
ON public.platform_league_fixtures
FOR ALL
TO authenticated
USING (public.is_platform_association_admin(auth.uid(), association_id))
WITH CHECK (public.is_platform_association_admin(auth.uid(), association_id));