
CREATE OR REPLACE VIEW public.club_access_public
WITH (security_invoker = on) AS
SELECT
  club_id,
  access_control_type,
  ble_fallback_enabled,
  shelly_door_ble_mac,
  shelly_door_channel,
  shelly_door_pulse_ms
FROM public.club_secrets;

GRANT SELECT ON public.club_access_public TO authenticated;

-- Allow any authenticated member of the club to see its public access config.
CREATE POLICY "Members can read public access config"
  ON public.club_secrets
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = club_secrets.club_id
        AND cm.user_id = auth.uid()
    )
  );
