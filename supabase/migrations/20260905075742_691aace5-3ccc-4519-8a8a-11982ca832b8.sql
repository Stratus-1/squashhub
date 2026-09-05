-- SMS channel: platform gateway settings live in app_settings ("private" keys
-- are readable only by platform admins). Per-club opt-in + sender id on clubs.

ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS sms_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sms_sender_id text;

CREATE TABLE IF NOT EXISTS public.sms_send_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid REFERENCES public.clubs(id) ON DELETE SET NULL,
  member_id uuid REFERENCES public.club_members(id) ON DELETE SET NULL,
  to_phone text NOT NULL,
  from_sender text,
  kind text,
  body text,
  segments integer NOT NULL DEFAULT 1,
  unit_cost numeric NOT NULL DEFAULT 0,
  billable boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'sent',
  error text,
  provider text,
  provider_ref text,
  sent_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.sms_send_log TO authenticated;
GRANT ALL ON public.sms_send_log TO service_role;
ALTER TABLE public.sms_send_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Club admins read their club sms log" ON public.sms_send_log;
CREATE POLICY "Club admins read their club sms log"
ON public.sms_send_log FOR SELECT TO authenticated
USING (
  public.is_platform_admin(auth.uid())
  OR (club_id IS NOT NULL AND public.is_club_admin(auth.uid(), club_id))
);

CREATE INDEX IF NOT EXISTS sms_send_log_club_created_idx
  ON public.sms_send_log (club_id, created_at DESC);

-- Members may opt out of non-critical SMS.
ALTER TABLE public.club_members
  ADD COLUMN IF NOT EXISTS sms_opt_out boolean NOT NULL DEFAULT false;

INSERT INTO public.app_settings (key, value) VALUES
  ('sms_enabled', 'false'),
  ('sms_provider', 'smsportal'),
  ('sms_sender_id', 'SquashHub'),
  ('sms_default_country_code', '27'),
  ('sms_api_base', ''),
  ('sms_unit_cost', '0.25'),
  ('sms_private_api_key', ''),
  ('sms_private_api_secret', '')
ON CONFLICT (key) DO NOTHING;