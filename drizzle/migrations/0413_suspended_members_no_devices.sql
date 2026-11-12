-- Suspended / resigned members may not operate any club device (doors, lights,
-- geysers, gadgets). Club admins stay exempt, matching the main-door rule.
CREATE OR REPLACE FUNCTION public.can_operate_device(_user_id uuid, _device_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      AND (
        public.is_club_admin(_user_id, d.club_id)
        OR NOT public.member_access_blocked(_user_id, d.club_id, NULL)
      )
  );
$function$;

-- Bluetooth backup unlock details are withheld from suspended members so the
-- offline path cannot bypass the server check.
CREATE OR REPLACE FUNCTION public.get_club_member_config(_club_id uuid)
 RETURNS TABLE(club_id uuid, access_control_type text, relay_device_type text, ble_fallback_enabled boolean, shelly_door_ble_mac text, shelly_ble_control_password text, shelly_door_channel integer, shelly_door_pulse_ms integer, bank_name text, bank_account_name text, bank_account_number text, bank_branch_code text, bank_reference text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH blocked AS (
    SELECT (public.member_access_blocked(auth.uid(), _club_id, NULL)
            AND NOT public.is_club_admin(auth.uid(), _club_id)) AS b
  )
  SELECT s.club_id,
         s.access_control_type::text,
         s.relay_device_type::text,
         CASE WHEN blocked.b THEN false ELSE s.ble_fallback_enabled END,
         CASE WHEN blocked.b THEN NULL ELSE s.shelly_door_ble_mac END,
         CASE WHEN blocked.b THEN NULL ELSE s.shelly_ble_control_password END,
         s.shelly_door_channel,
         s.shelly_door_pulse_ms,
         s.bank_name,
         s.bank_account_name,
         s.bank_account_number,
         s.bank_branch_code,
         s.bank_reference
  FROM public.club_secrets s, blocked
  WHERE s.club_id = _club_id
    AND EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = s.club_id AND cm.user_id = auth.uid()
    )
$function$;