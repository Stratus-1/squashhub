-- 1) Remove broad member read on club_secrets
DROP POLICY IF EXISTS "Members can read public access config" ON public.club_secrets;

-- 2) Member-safe subset via security definer RPC
CREATE OR REPLACE FUNCTION public.get_club_member_config(_club_id uuid)
RETURNS TABLE (
  club_id uuid,
  access_control_type text,
  relay_device_type text,
  ble_fallback_enabled boolean,
  shelly_door_ble_mac text,
  shelly_ble_control_password text,
  shelly_door_channel integer,
  shelly_door_pulse_ms integer,
  bank_name text,
  bank_account_name text,
  bank_account_number text,
  bank_branch_code text,
  bank_reference text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.club_id,
         s.access_control_type::text,
         s.relay_device_type::text,
         s.ble_fallback_enabled,
         s.shelly_door_ble_mac,
         s.shelly_ble_control_password,
         s.shelly_door_channel,
         s.shelly_door_pulse_ms,
         s.bank_name,
         s.bank_account_name,
         s.bank_account_number,
         s.bank_branch_code,
         s.bank_reference
  FROM public.club_secrets s
  WHERE s.club_id = _club_id
    AND EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = s.club_id AND cm.user_id = auth.uid()
    )
$$;

REVOKE ALL ON FUNCTION public.get_club_member_config(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_club_member_config(uuid) TO authenticated;

-- 3) Scope ops booking photos to the owning club (path prefix = club_id)
DROP POLICY IF EXISTS "Ops photos: club members read" ON storage.objects;
DROP POLICY IF EXISTS "Ops photos: authenticated upload" ON storage.objects;
DROP POLICY IF EXISTS "Ops photos: authenticated update" ON storage.objects;
DROP POLICY IF EXISTS "Ops photos: authenticated delete" ON storage.objects;

CREATE POLICY "Ops photos: club members read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'ops-booking-photos'
  AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  AND EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.user_id = auth.uid()
      AND cm.club_id = ((storage.foldername(name))[1])::uuid
  )
);

CREATE POLICY "Ops photos: club members upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'ops-booking-photos'
  AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  AND EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.user_id = auth.uid()
      AND cm.club_id = ((storage.foldername(name))[1])::uuid
  )
);

CREATE POLICY "Ops photos: club admins update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'ops-booking-photos'
  AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  AND public.is_club_admin(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

CREATE POLICY "Ops photos: club admins delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'ops-booking-photos'
  AND (storage.foldername(name))[1] ~ '^[0-9a-fA-F-]{36}$'
  AND public.is_club_admin(auth.uid(), ((storage.foldername(name))[1])::uuid)
);