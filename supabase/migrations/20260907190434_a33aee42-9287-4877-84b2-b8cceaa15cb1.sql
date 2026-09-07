ALTER TABLE public.club_devices
  ADD COLUMN IF NOT EXISTS show_on_dashboard boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dashboard_role_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

-- Preserve today's behaviour: doors/gates and court-light rows were already
-- member-operable; gadgets were staff-only and stay that way until opted in.
UPDATE public.club_devices SET show_on_dashboard = true WHERE category IN ('lights','access');

ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS door_show_on_dashboard boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS door_dashboard_role_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

CREATE OR REPLACE FUNCTION public.member_in_permission_roles(_user_id uuid, _club_id uuid, _role_ids uuid[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(array_length(_role_ids, 1), 0) = 0
     OR EXISTS (
       SELECT 1
       FROM public.club_members cm
       JOIN public.club_member_permissions cmp ON cmp.club_member_id = cm.id
       WHERE cm.club_id = _club_id
         AND cm.user_id = _user_id
         AND (cmp.is_full_admin = true OR cmp.permission_role_id = ANY(_role_ids))
     );
$$;

CREATE OR REPLACE FUNCTION public.can_operate_device(_user_id uuid, _device_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.club_devices d
    WHERE d.id = _device_id AND d.enabled
      AND (
        public.is_club_admin_or_permitted(_user_id, d.club_id, 'devices')
        OR (
          d.show_on_dashboard
          AND public.is_club_member(_user_id, d.club_id)
          AND public.member_in_permission_roles(_user_id, d.club_id, d.dashboard_role_ids)
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_open_club_door(_user_id uuid, _club_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_club_admin_or_permitted(_user_id, _club_id, 'devices')
     OR public.is_club_admin_or_permitted(_user_id, _club_id, 'access')
     OR EXISTS (
       SELECT 1 FROM public.clubs c
       WHERE c.id = _club_id
         AND c.door_show_on_dashboard
         AND public.is_club_member(_user_id, _club_id)
         AND public.member_in_permission_roles(_user_id, _club_id, c.door_dashboard_role_ids)
     );
$$;

DROP POLICY IF EXISTS "Members read member-facing devices" ON public.club_devices;
CREATE POLICY "Members read member-facing devices"
ON public.club_devices
FOR SELECT
USING (
  public.is_club_admin_or_permitted(auth.uid(), club_id, 'devices')
  OR (
    category IN ('lights','access')
    AND public.is_club_member(auth.uid(), club_id)
    AND public.member_in_permission_roles(auth.uid(), club_id, dashboard_role_ids)
  )
  OR (
    show_on_dashboard
    AND public.is_club_member(auth.uid(), club_id)
    AND public.member_in_permission_roles(auth.uid(), club_id, dashboard_role_ids)
  )
);