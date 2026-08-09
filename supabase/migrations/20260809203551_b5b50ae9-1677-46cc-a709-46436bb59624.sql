ALTER TABLE public.whatsapp_send_log
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'out',
  ADD COLUMN IF NOT EXISTS from_phone text,
  ADD COLUMN IF NOT EXISTS payload jsonb;

CREATE TABLE IF NOT EXISTS public.whatsapp_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  member_id uuid REFERENCES public.club_members(id) ON DELETE SET NULL,
  phone text NOT NULL,
  kind text NOT NULL,
  target_id uuid,
  prompt text,
  status text NOT NULL DEFAULT 'pending',
  response text,
  responded_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.whatsapp_interactions TO authenticated;
GRANT ALL ON public.whatsapp_interactions TO service_role;

ALTER TABLE public.whatsapp_interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Club admins view whatsapp interactions"
  ON public.whatsapp_interactions FOR SELECT TO authenticated
  USING (is_club_admin(auth.uid(), club_id) OR is_platform_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS whatsapp_interactions_phone_idx
  ON public.whatsapp_interactions (phone, status, created_at DESC);
CREATE INDEX IF NOT EXISTS whatsapp_interactions_target_idx
  ON public.whatsapp_interactions (kind, target_id);

CREATE TRIGGER trg_whatsapp_interactions_updated_at
  BEFORE UPDATE ON public.whatsapp_interactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();