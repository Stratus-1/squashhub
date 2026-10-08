CREATE TABLE public.role_capability_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid REFERENCES public.clubs(id) ON DELETE CASCADE, -- NULL = standard baseline
  role_name text NOT NULL,
  capability_key text NOT NULL REFERENCES public.capability_catalogue(key),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX role_cap_tpl_uniq ON public.role_capability_templates (COALESCE(club_id,'00000000-0000-0000-0000-000000000000'::uuid), role_name, capability_key);
GRANT SELECT ON public.role_capability_templates TO authenticated;
GRANT ALL ON public.role_capability_templates TO service_role;
ALTER TABLE public.role_capability_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read baseline or own club templates" ON public.role_capability_templates FOR SELECT TO authenticated
USING (club_id IS NULL OR public.is_platform_admin(auth.uid()) OR EXISTS (SELECT 1 FROM public.club_members m WHERE m.club_id = role_capability_templates.club_id AND m.user_id = auth.uid()));

-- Office -> template mapping (an office applies these role templates)
CREATE TABLE public.office_role_defaults (
  office text NOT NULL,
  role_name text NOT NULL,
  PRIMARY KEY (office, role_name)
);
GRANT SELECT ON public.office_role_defaults TO authenticated;
GRANT ALL ON public.office_role_defaults TO service_role;
ALTER TABLE public.office_role_defaults ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone signed in can read office defaults" ON public.office_role_defaults FOR SELECT TO authenticated USING (true);

-- New-model answer: (office defaults + role templates + personal grants) minus personal denies.
CREATE OR REPLACE FUNCTION public.new_model_cap(_user_id uuid, _club_id uuid, _capability text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH me AS (SELECT id FROM public.club_members WHERE club_id = _club_id AND user_id = _user_id),
  roles AS (
    SELECT a.role_name FROM public.member_role_assignments a
    WHERE a.club_id = _club_id AND a.revoked_at IS NULL AND a.club_member_id IN (SELECT id FROM me)
    UNION
    SELECT d.role_name FROM public.club_offices o JOIN public.office_role_defaults d ON d.office = o.office
    WHERE o.club_id = _club_id AND o.ended_at IS NULL AND o.club_member_id IN (SELECT id FROM me)
  ),
  ov AS (
    SELECT o.effect FROM public.member_capability_overrides o
    WHERE o.club_id = _club_id AND o.capability_key = _capability AND o.revoked_at IS NULL
      AND o.club_member_id IN (SELECT id FROM me)
  )
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM ov WHERE effect = 'deny') THEN false
    WHEN EXISTS (SELECT 1 FROM ov WHERE effect = 'grant') THEN true
    ELSE EXISTS (
      SELECT 1 FROM public.role_capability_templates t JOIN roles r ON r.role_name = t.role_name
      WHERE t.capability_key = _capability
        AND (t.club_id = _club_id OR (t.club_id IS NULL AND NOT EXISTS (
              SELECT 1 FROM public.role_capability_templates c WHERE c.club_id = _club_id AND c.role_name = t.role_name))))
  END
$$;

-- has_cap new path now uses the full model (still only when a club's gate is ON).
CREATE OR REPLACE FUNCTION public.has_cap(_user_id uuid, _club_id uuid, _capability text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN COALESCE((SELECT NOT s.legacy_mode AND s.new_permissions_enabled FROM public.club_permission_settings s WHERE s.club_id = _club_id), false)
    THEN public.new_model_cap(_user_id, _club_id, _capability)
    ELSE public.is_club_admin(_user_id, _club_id)
  END
$$;