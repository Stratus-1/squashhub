REVOKE SELECT ON public.org_groupings FROM authenticated;
GRANT SELECT (id, parent_org_id, child_org_id, mode, created_at) ON public.org_groupings TO authenticated;
GRANT ALL ON public.org_groupings TO service_role;