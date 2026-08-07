ALTER TABLE public.club_members
  ADD COLUMN IF NOT EXISTS whatsapp_opt_out boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.whatsapp_send_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid REFERENCES public.clubs(id) ON DELETE CASCADE,
  member_id uuid REFERENCES public.club_members(id) ON DELETE SET NULL,
  to_phone text NOT NULL,
  kind text NOT NULL DEFAULT 'freeform',
  body text,
  provider_sid text,
  status text NOT NULL DEFAULT 'queued',
  error text,
  sent_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_send_log_club_idx ON public.whatsapp_send_log (club_id, created_at DESC);

GRANT SELECT ON public.whatsapp_send_log TO authenticated;
GRANT ALL ON public.whatsapp_send_log TO service_role;

ALTER TABLE public.whatsapp_send_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Club admins view whatsapp log" ON public.whatsapp_send_log;
CREATE POLICY "Club admins view whatsapp log"
  ON public.whatsapp_send_log FOR SELECT TO authenticated
  USING (public.is_club_admin(auth.uid(), club_id) OR public.is_platform_admin(auth.uid()));