CREATE TABLE IF NOT EXISTS public.club_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('lights', 'access', 'gadgets')),
  name text NOT NULL,
  icon text,
  location text,
  notes text,
  enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  control_mode text NOT NULL DEFAULT 'toggle' CHECK (control_mode IN ('toggle', 'pulse')),
  provider text NOT NULL DEFAULT 'shelly' CHECK (provider IN ('shelly', 'other')),
  shelly_device_id text,
  shelly_channel integer NOT NULL DEFAULT 0 CHECK (shelly_channel >= 0),
  pulse_ms integer NOT NULL DEFAULT 3000 CHECK (pulse_ms BETWEEN 200 AND 3600000),
  ble_mac text,
  auto_off_minutes integer CHECK (auto_off_minutes IS NULL OR auto_off_minutes BETWEEN 1 AND 1440),
  last_state boolean,
  last_state_at timestamptz,
  last_error text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (club_id, category, name)
);

CREATE INDEX IF NOT EXISTS idx_club_devices_club_category ON public.club_devices (club_id, category, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_devices TO authenticated;
GRANT ALL ON public.club_devices TO service_role;

ALTER TABLE public.club_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read member-facing devices" ON public.club_devices;
CREATE POLICY "Members read member-facing devices"
ON public.club_devices FOR SELECT TO authenticated
USING (
  (category IN ('lights', 'access') AND public.is_club_member(auth.uid(), club_id))
  OR public.is_club_admin_or_permitted(auth.uid(), club_id, 'devices')
);

DROP POLICY IF EXISTS "Device managers write devices" ON public.club_devices;
CREATE POLICY "Device managers write devices"
ON public.club_devices FOR ALL TO authenticated
USING (public.is_club_admin_or_permitted(auth.uid(), club_id, 'devices'))
WITH CHECK (public.is_club_admin_or_permitted(auth.uid(), club_id, 'devices'));

DROP TRIGGER IF EXISTS trg_club_devices_updated_at ON public.club_devices;
CREATE TRIGGER trg_club_devices_updated_at
BEFORE UPDATE ON public.club_devices
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.can_operate_device(_user_id uuid, _device_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.club_devices d
    WHERE d.id = _device_id AND d.enabled
      AND (
        public.is_club_admin_or_permitted(_user_id, d.club_id, 'devices')
        OR (d.category IN ('lights', 'access') AND public.is_club_member(_user_id, d.club_id))
      )
  );
$$;
GRANT EXECUTE ON FUNCTION public.can_operate_device(uuid, uuid) TO authenticated, service_role;

INSERT INTO public.club_devices (club_id, category, name, icon, location, notes, control_mode, provider, shelly_device_id, shelly_channel, pulse_ms, ble_mac)
SELECT s.club_id, 'access', 'Main door', 'door', 'Main entrance', 'Migrated from the previous Door Access Shelly configuration.', 'pulse', 'shelly', s.shelly_door_device_id, COALESCE(s.shelly_door_channel, 0), GREATEST(COALESCE(s.shelly_door_pulse_ms, 3000), 200), s.shelly_door_ble_mac
FROM public.club_secrets s
WHERE s.shelly_door_device_id IS NOT NULL
ON CONFLICT (club_id, category, name) DO NOTHING;

INSERT INTO public.club_devices (club_id, category, name, icon, location, notes, control_mode, provider, shelly_device_id, shelly_channel, pulse_ms, ble_mac)
SELECT c.club_id, 'lights', c.name || ' court lights', 'lightbulb', c.name, 'Migrated from the previous court relay configuration.', 'toggle', 'shelly', c.relay_device_id, GREATEST(COALESCE(c.relay_channel, 0), 0), 3000, c.relay_ble_mac
FROM public.courts c
WHERE c.relay_device_id IS NOT NULL AND COALESCE(c.is_external, false) = false
ON CONFLICT (club_id, category, name) DO NOTHING;