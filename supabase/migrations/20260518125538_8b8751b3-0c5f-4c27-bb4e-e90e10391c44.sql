
-- Provider config on club_secrets
ALTER TABLE public.club_secrets
  ADD COLUMN IF NOT EXISTS access_provider text,
  ADD COLUMN IF NOT EXISTS zk_base_url text,
  ADD COLUMN IF NOT EXISTS zk_username text,
  ADD COLUMN IF NOT EXISTS zk_password text,
  ADD COLUMN IF NOT EXISTS zk_area_id text,
  ADD COLUMN IF NOT EXISTS zk_door_group text,
  ADD COLUMN IF NOT EXISTS zk_webhook_secret text;

-- Per-member face/consent tracking
ALTER TABLE public.club_members
  ADD COLUMN IF NOT EXISTS face_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS face_provisioned_at timestamptz,
  ADD COLUMN IF NOT EXISTS face_provider_person_id text;

-- Provisioning log
CREATE TABLE IF NOT EXISTS public.access_provisioning_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  club_member_id uuid REFERENCES public.club_members(id) ON DELETE SET NULL,
  provider text NOT NULL,
  action text NOT NULL,
  status text NOT NULL,
  request jsonb,
  response jsonb,
  attempts int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_apl_club ON public.access_provisioning_log(club_id, created_at DESC);

ALTER TABLE public.access_provisioning_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Club admins read access log" ON public.access_provisioning_log;
CREATE POLICY "Club admins read access log"
ON public.access_provisioning_log FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.club_id = access_provisioning_log.club_id
      AND cm.user_id = auth.uid()
      AND cm.role = 'admin'
  )
);

-- Door events
CREATE TABLE IF NOT EXISTS public.access_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  club_member_id uuid REFERENCES public.club_members(id) ON DELETE SET NULL,
  provider_person_id text,
  door_name text,
  event_type text NOT NULL DEFAULT 'access_granted',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  raw jsonb
);
CREATE INDEX IF NOT EXISTS idx_ae_club_time ON public.access_events(club_id, occurred_at DESC);

ALTER TABLE public.access_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Club admins read access events" ON public.access_events;
CREATE POLICY "Club admins read access events"
ON public.access_events FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.club_members cm
    WHERE cm.club_id = access_events.club_id
      AND cm.user_id = auth.uid()
      AND cm.role = 'admin'
  )
);
