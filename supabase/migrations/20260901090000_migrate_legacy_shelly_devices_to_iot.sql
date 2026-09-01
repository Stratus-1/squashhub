-- Move the existing Shelly integrations into the single IoT device registry.
-- The source tables remain intact because booking/access runtime code still
-- reads some of their fields, but the admin device surface is now unified.

INSERT INTO public.club_devices (
  club_id,
  category,
  name,
  icon,
  location,
  notes,
  control_mode,
  provider,
  shelly_device_id,
  shelly_channel,
  pulse_ms,
  ble_mac
)
SELECT
  s.club_id,
  'access',
  'Main door',
  'door',
  'Main entrance',
  'Migrated from the previous Door Access Shelly configuration.',
  'pulse',
  'shelly',
  s.shelly_door_device_id,
  COALESCE(s.shelly_door_channel, 0),
  GREATEST(COALESCE(s.shelly_door_pulse_ms, 3000), 200),
  s.shelly_door_ble_mac
FROM public.club_secrets s
WHERE s.shelly_door_device_id IS NOT NULL
ON CONFLICT (club_id, category, name) DO NOTHING;

INSERT INTO public.club_devices (
  club_id,
  category,
  name,
  icon,
  location,
  notes,
  control_mode,
  provider,
  shelly_device_id,
  shelly_channel,
  pulse_ms,
  ble_mac
)
SELECT
  c.club_id,
  'lights',
  c.name || ' lights',
  'lightbulb',
  c.name,
  'Migrated from the previous court relay configuration.',
  'toggle',
  'shelly',
  c.relay_device_id,
  GREATEST(COALESCE(c.relay_channel, 0), 0),
  3000,
  c.relay_ble_mac
FROM public.courts c
WHERE c.relay_device_id IS NOT NULL
  AND COALESCE(c.is_external, false) = false
ON CONFLICT (club_id, category, name) DO NOTHING;
