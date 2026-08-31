-- Generic per-club IoT device registry.
--
-- Until now every smart device was a bespoke set of columns: the door lived in
-- club_secrets (shelly_door_*), court lights lived on courts (relay_ble_mac,
-- shelly_schedule_*) and anything else — a geyser, a pump, a heater — had
-- nowhere to go at all. This table is the open-ended home for devices, grouped
-- by what a club member actually calls them:
--
--   lights  — clubhouse / outside / parking lights (NOT court lights, which
--             stay coupled to bookings so the per-hour light fee still bills)
--   access  — secondary doors, gates, turnstiles
--   gadgets — geysers, pumps, heaters, signage, anything else
--
-- The existing door and court-light configuration is deliberately left alone;
-- this registry supplements it rather than migrating it.

CREATE TABLE IF NOT EXISTS public.club_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,

  category text NOT NULL CHECK (category IN ('lights', 'access', 'gadgets')),
  name text NOT NULL,
  -- lucide-react icon slug, resolved client-side against a small allow-list
  icon text,
  location text,
  notes text,

  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,

  -- How the control renders and what the relay is asked to do:
  --   toggle — a switch; stays on until switched off (geyser, outside lights)
  --   pulse  — a momentary button; relay closes for pulse_ms (gate, door strike)
  control_mode text NOT NULL DEFAULT 'toggle'
    CHECK (control_mode IN ('toggle', 'pulse')),

  provider text NOT NULL DEFAULT 'shelly' CHECK (provider IN ('shelly', 'other')),
  shelly_device_id text,
  shelly_channel integer NOT NULL DEFAULT 0 CHECK (shelly_channel >= 0),
  pulse_ms integer NOT NULL DEFAULT 3000 CHECK (pulse_ms BETWEEN 200 AND 3600000),
  ble_mac text,

  -- Safety net for gadgets that cost money to leave running. When set, the
  -- device is switched on with a Shelly auto-off timer of this many minutes.
  auto_off_minutes integer CHECK (auto_off_minutes IS NULL OR auto_off_minutes BETWEEN 1 AND 1440),

  -- Last known relay state, refreshed by the device-control edge function.
  last_state boolean,
  last_state_at timestamptz,
  last_error text,

  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Names must be unique within a group, so two rows in the same dashboard
  -- heading can never be told apart only by their relay ID. The same name in
  -- two different groups is allowed ("Front gate" light vs "Front gate" door).
  UNIQUE (club_id, category, name)
);

CREATE INDEX IF NOT EXISTS idx_club_devices_club_category
  ON public.club_devices (club_id, category, sort_order);

ALTER TABLE public.club_devices ENABLE ROW LEVEL SECURITY;

-- Read: members see lights + access devices (the things they operate day to
-- day). Gadgets are running-cost / safety items, so only club admins and
-- members holding the 'devices' permission can even see they exist.
DROP POLICY IF EXISTS "Members read member-facing devices" ON public.club_devices;
CREATE POLICY "Members read member-facing devices"
ON public.club_devices FOR SELECT TO authenticated
USING (
  (category IN ('lights', 'access') AND public.is_club_member(auth.uid(), club_id))
  OR public.is_club_admin_or_permitted(auth.uid(), club_id, 'devices')
);

-- Write: club admins, or a member explicitly granted the 'devices' permission.
DROP POLICY IF EXISTS "Device managers write devices" ON public.club_devices;
CREATE POLICY "Device managers write devices"
ON public.club_devices FOR ALL TO authenticated
USING (public.is_club_admin_or_permitted(auth.uid(), club_id, 'devices'))
WITH CHECK (public.is_club_admin_or_permitted(auth.uid(), club_id, 'devices'));

DROP TRIGGER IF EXISTS trg_club_devices_updated_at ON public.club_devices;
CREATE TRIGGER trg_club_devices_updated_at
BEFORE UPDATE ON public.club_devices
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Server-side authority for the device-control edge function. Mirrors the RLS
-- read rule: gadgets require the elevated grant, lights/access need membership.
CREATE OR REPLACE FUNCTION public.can_operate_device(_user_id uuid, _device_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.club_devices d
    WHERE d.id = _device_id
      AND d.enabled
      AND (
        public.is_club_admin_or_permitted(_user_id, d.club_id, 'devices')
        OR (d.category IN ('lights', 'access') AND public.is_club_member(_user_id, d.club_id))
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.can_operate_device(uuid, uuid) TO authenticated, service_role;
