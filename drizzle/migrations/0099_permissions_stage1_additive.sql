-- Stage 1 of the club-wide roles & permissions redesign: ADDITIVE ONLY.
-- New catalogue/assignment/override/workflow/audit tables plus has_cap()/can_grant().
-- club_permission_settings.legacy_mode defaults ON, so has_cap() returns the legacy
-- answer for every club until a club's gate is explicitly switched. No existing
-- table, function, policy or permission is changed.

-- 1. Per-club gate and thresholds
CREATE TABLE public.club_permission_settings (
  club_id uuid PRIMARY KEY REFERENCES public.clubs(id) ON DELETE CASCADE,
  legacy_mode boolean NOT NULL DEFAULT true,
  new_permissions_enabled boolean NOT NULL DEFAULT false,
  discount_second_approval_cents integer NOT NULL DEFAULT 10000,
  refund_second_approval boolean NOT NULL DEFAULT true,
  journal_second_approval_cents integer NOT NULL DEFAULT 500000,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.club_permission_settings TO authenticated;
GRANT ALL ON public.club_permission_settings TO service_role;
ALTER TABLE public.club_permission_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY club_permission_settings_select ON public.club_permission_settings
  FOR SELECT TO authenticated
  USING (public.is_club_admin_or_permitted(auth.uid(), club_id, 'settings'));

-- 2. Capability catalogue
CREATE TABLE public.capability_catalogue (
  key text PRIMARY KEY,
  area text NOT NULL,
  action text NOT NULL,
  cap_class text NOT NULL CHECK (cap_class IN ('O','S','F','X','G')),
  delegable boolean NOT NULL DEFAULT false,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.capability_catalogue TO authenticated;
GRANT ALL ON public.capability_catalogue TO service_role;
ALTER TABLE public.capability_catalogue ENABLE ROW LEVEL SECURITY;
CREATE POLICY capability_catalogue_select ON public.capability_catalogue
  FOR SELECT TO authenticated USING (true);

-- 3. Role template assignments (which roles a member holds in a club)
CREATE TABLE public.member_role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  club_member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  role_name text NOT NULL,
  source text NOT NULL DEFAULT 'personal' CHECK (source IN ('office','personal','delegated','migration')),
  granted_by uuid,
  delegated_from uuid REFERENCES public.member_role_assignments(id) ON DELETE SET NULL,
  reason text,
  revoked_at timestamptz,
  revoked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (club_id, club_member_id, role_name)
);
GRANT SELECT ON public.member_role_assignments TO authenticated;
GRANT ALL ON public.member_role_assignments TO service_role;
ALTER TABLE public.member_role_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY member_role_assignments_select ON public.member_role_assignments
  FOR SELECT TO authenticated
  USING (public.is_club_admin_or_permitted(auth.uid(), club_id, 'members'));

-- 4. Per-person capability overrides (grants and denies; a deny always wins)
CREATE TABLE public.member_capability_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  club_member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  capability_key text NOT NULL REFERENCES public.capability_catalogue(key),
  effect text NOT NULL CHECK (effect IN ('grant','deny')),
  can_delegate boolean NOT NULL DEFAULT false,
  source text NOT NULL DEFAULT 'personal' CHECK (source IN ('role','personal','delegated','nominated','self','migration')),
  granted_by uuid,
  delegated_from uuid REFERENCES public.member_capability_overrides(id) ON DELETE SET NULL,
  reason text,
  revoked_at timestamptz,
  revoked_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (club_id, club_member_id, capability_key)
);
GRANT SELECT ON public.member_capability_overrides TO authenticated;
GRANT ALL ON public.member_capability_overrides TO service_role;
ALTER TABLE public.member_capability_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY member_capability_overrides_select ON public.member_capability_overrides
  FOR SELECT TO authenticated
  USING (public.is_club_admin_or_permitted(auth.uid(), club_id, 'members'));

-- 5. Club offices with exactly one open Chairman per club
CREATE TABLE public.club_offices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  office text NOT NULL CHECK (office IN ('chairman','vice_chair','secretary','treasurer','club_captain')),
  club_member_id uuid NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  appointed_by uuid,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX club_offices_one_open_chairman
  ON public.club_offices (club_id) WHERE office = 'chairman' AND ended_at IS NULL;
GRANT SELECT ON public.club_offices TO authenticated;
GRANT ALL ON public.club_offices TO service_role;
ALTER TABLE public.club_offices ENABLE ROW LEVEL SECURITY;
CREATE POLICY club_offices_select ON public.club_offices
  FOR SELECT TO authenticated
  USING (public.is_club_admin_or_permitted(auth.uid(), club_id, 'members'));

-- 6. Chairman handovers (normal succession; successor must accept)
CREATE TABLE public.chairman_handovers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  from_member_id uuid NOT NULL REFERENCES public.club_members(id),
  to_member_id uuid NOT NULL REFERENCES public.club_members(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','completed','cancelled')),
  effective_at timestamptz,
  accepted_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.chairman_handovers TO authenticated;
GRANT ALL ON public.chairman_handovers TO service_role;
ALTER TABLE public.chairman_handovers ENABLE ROW LEVEL SECURITY;
CREATE POLICY chairman_handovers_select ON public.chairman_handovers
  FOR SELECT TO authenticated
  USING (public.is_club_admin_or_permitted(auth.uid(), club_id, 'members'));

-- 7. Emergency chairman replacement requests and votes
CREATE TABLE public.chairman_emergency_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  proposed_member_id uuid NOT NULL REFERENCES public.club_members(id),
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','approved','completed','cancelled')),
  initiated_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
GRANT SELECT ON public.chairman_emergency_requests TO authenticated;
GRANT ALL ON public.chairman_emergency_requests TO service_role;
ALTER TABLE public.chairman_emergency_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY chairman_emergency_requests_select ON public.chairman_emergency_requests
  FOR SELECT TO authenticated
  USING (public.is_club_admin_or_permitted(auth.uid(), club_id, 'members'));

CREATE TABLE public.chairman_emergency_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.chairman_emergency_requests(id) ON DELETE CASCADE,
  voter_member_id uuid NOT NULL REFERENCES public.club_members(id),
  voter_user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, voter_member_id)
);
GRANT SELECT ON public.chairman_emergency_votes TO authenticated;
GRANT ALL ON public.chairman_emergency_votes TO service_role;
ALTER TABLE public.chairman_emergency_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY chairman_emergency_votes_select ON public.chairman_emergency_votes
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.chairman_emergency_requests r
    WHERE r.id = request_id
      AND public.is_club_admin_or_permitted(auth.uid(), r.club_id, 'members')
  ));

-- 8. Capability nominations (class X: nominate, Chairman approves)
CREATE TABLE public.capability_nominations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  nominee_member_id uuid NOT NULL REFERENCES public.club_members(id),
  capability_key text NOT NULL REFERENCES public.capability_catalogue(key),
  scope text,
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined','withdrawn')),
  nominated_by uuid NOT NULL,
  decided_by uuid,
  decided_at timestamptz,
  reminder_count integer NOT NULL DEFAULT 0,
  last_reminded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.capability_nominations TO authenticated;
GRANT ALL ON public.capability_nominations TO service_role;
ALTER TABLE public.capability_nominations ENABLE ROW LEVEL SECURITY;
CREATE POLICY capability_nominations_select ON public.capability_nominations
  FOR SELECT TO authenticated
  USING (public.is_club_admin_or_permitted(auth.uid(), club_id, 'members'));

-- 9. Append-only permission audit events
CREATE TABLE public.permission_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  actor_user_id uuid,
  actor_member_id uuid,
  event_type text NOT NULL,
  target_member_id uuid,
  capability_key text,
  role_name text,
  office text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.permission_events TO authenticated;
GRANT ALL ON public.permission_events TO service_role;
ALTER TABLE public.permission_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY permission_events_select ON public.permission_events
  FOR SELECT TO authenticated
  USING (public.is_club_admin_or_permitted(auth.uid(), club_id, 'members'));

-- 10. Shadow-mode comparison log (legacy answer vs new-model answer)
CREATE TABLE public.permission_shadow_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  capability_key text NOT NULL,
  legacy_answer boolean NOT NULL,
  new_answer boolean NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.permission_shadow_log TO service_role;
ALTER TABLE public.permission_shadow_log ENABLE ROW LEVEL SECURITY;

-- 11. Pre-stage snapshots of effective rights per person per club
CREATE TABLE public.permission_inventory_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  stage text NOT NULL,
  snapshot jsonb NOT NULL,
  taken_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.permission_inventory_snapshots TO service_role;
ALTER TABLE public.permission_inventory_snapshots ENABLE ROW LEVEL SECURITY;

-- 12. has_cap(): single wrapper. While the club's legacy_mode is ON (the default),
-- it returns exactly today's legacy answer and changes nothing.
CREATE OR REPLACE FUNCTION public.has_cap(_user_id uuid, _club_id uuid, _capability text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN COALESCE((
      SELECT NOT s.legacy_mode AND s.new_permissions_enabled
      FROM public.club_permission_settings s
      WHERE s.club_id = _club_id
    ), false)
    THEN COALESCE((
      SELECT bool_and(o.effect = 'grant')
      FROM public.member_capability_overrides o
      JOIN public.club_members m ON m.id = o.club_member_id
      WHERE o.club_id = _club_id
        AND m.user_id = _user_id
        AND o.capability_key = _capability
        AND o.revoked_at IS NULL
      HAVING count(*) > 0
    ), false)
    ELSE public.is_club_admin(_user_id, _club_id)
  END
$$;
GRANT EXECUTE ON FUNCTION public.has_cap(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_cap(uuid, uuid, text) TO service_role;

-- 13. can_grant(): who may grant a capability. In legacy mode defers to the
-- existing admin check so behaviour is unchanged; new-model rules apply per club
-- once its gate is ON.
CREATE OR REPLACE FUNCTION public.can_grant(_user_id uuid, _club_id uuid, _capability text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN COALESCE((
      SELECT NOT s.legacy_mode AND s.new_permissions_enabled
      FROM public.club_permission_settings s
      WHERE s.club_id = _club_id
    ), false)
    THEN (
      public.is_platform_admin(_user_id)
      OR EXISTS (
        SELECT 1 FROM public.club_offices co
        JOIN public.club_members m ON m.id = co.club_member_id
        WHERE co.club_id = _club_id
          AND co.office = 'chairman'
          AND co.ended_at IS NULL
          AND m.user_id = _user_id
      )
    )
    ELSE public.is_club_admin(_user_id, _club_id)
  END
$$;
GRANT EXECUTE ON FUNCTION public.can_grant(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_grant(uuid, uuid, text) TO service_role;

COMMENT ON TABLE public.club_permission_settings IS 'Per-club gate for the new permissions model. legacy_mode=true (default) means has_cap()/can_grant() return the legacy answer; no club changes until its gate is explicitly switched.';
COMMENT ON TABLE public.permission_shadow_log IS 'Stage 3 shadow-mode comparison log; service_role only.';
COMMENT ON TABLE public.permission_inventory_snapshots IS 'Pre-stage snapshots of effective rights per person per club; service_role only.';