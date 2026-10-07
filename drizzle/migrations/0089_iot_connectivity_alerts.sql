CREATE TABLE public.club_iot_alert_settings (
  club_id uuid PRIMARY KEY REFERENCES public.clubs(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  recipient_member_ids uuid[] NOT NULL DEFAULT '{}',
  grace_minutes integer NOT NULL DEFAULT 5,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT iot_alert_max_two CHECK (coalesce(array_length(recipient_member_ids,1),0) <= 2),
  CONSTRAINT iot_alert_grace CHECK (grace_minutes BETWEEN 2 AND 60)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_iot_alert_settings TO authenticated;
GRANT ALL ON public.club_iot_alert_settings TO service_role;
ALTER TABLE public.club_iot_alert_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Club admins manage IoT alert settings" ON public.club_iot_alert_settings
  FOR ALL TO authenticated USING (public.is_club_admin(auth.uid(), club_id)) WITH CHECK (public.is_club_admin(auth.uid(), club_id));

CREATE TABLE public.club_iot_device_health (
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  label text,
  online boolean,
  last_checked_at timestamptz,
  last_online_at timestamptz,
  offline_since timestamptz,
  alert_sent_at timestamptz,
  PRIMARY KEY (club_id, device_id)
);
GRANT SELECT ON public.club_iot_device_health TO authenticated;
GRANT ALL ON public.club_iot_device_health TO service_role;
ALTER TABLE public.club_iot_device_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Club admins read IoT device health" ON public.club_iot_device_health
  FOR SELECT TO authenticated USING (public.is_club_admin(auth.uid(), club_id));