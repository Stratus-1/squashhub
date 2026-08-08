ALTER TABLE public.club_secrets
  ADD COLUMN IF NOT EXISTS wifi_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS wifi_ssid text,
  ADD COLUMN IF NOT EXISTS wifi_password text,
  ADD COLUMN IF NOT EXISTS wifi_security text NOT NULL DEFAULT 'WPA',
  ADD COLUMN IF NOT EXISTS wifi_hidden boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS wifi_notes text,
  ADD COLUMN IF NOT EXISTS wifi_visitors_allowed boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.get_club_wifi(_club_id uuid)
RETURNS TABLE (
  ssid text,
  password text,
  security text,
  hidden boolean,
  notes text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.wifi_ssid, s.wifi_password, s.wifi_security, s.wifi_hidden, s.wifi_notes
  FROM public.club_secrets s
  WHERE s.club_id = _club_id
    AND s.wifi_enabled = true
    AND s.wifi_ssid IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.club_members m
      WHERE m.club_id = _club_id
        AND m.user_id = auth.uid()
        AND COALESCE(m.status::text, 'active') <> 'resigned'
        AND (s.wifi_visitors_allowed OR m.role <> 'visitor')
    )
$$;

REVOKE ALL ON FUNCTION public.get_club_wifi(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_club_wifi(uuid) TO authenticated;