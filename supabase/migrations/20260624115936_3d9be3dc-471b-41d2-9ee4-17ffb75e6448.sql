
CREATE TABLE public.stitch_payment_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  club_member_id UUID NOT NULL REFERENCES public.club_members(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  purpose TEXT NOT NULL CHECK (purpose IN ('fee','topup','tournament')),
  method TEXT NOT NULL DEFAULT 'paybybank' CHECK (method IN ('paybybank','card')),
  fee_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
  champ_registration_id UUID NULL,
  description TEXT NULL,
  status TEXT NOT NULL DEFAULT 'created',
  stitch_request_id TEXT NULL,
  stitch_redirect_url TEXT NULL,
  stitch_payment_id TEXT NULL,
  payer_reference TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ NULL
);

CREATE INDEX stitch_sessions_user_idx ON public.stitch_payment_sessions(user_id, created_at DESC);
CREATE INDEX stitch_sessions_club_member_idx ON public.stitch_payment_sessions(club_member_id, created_at DESC);
CREATE INDEX stitch_sessions_request_idx ON public.stitch_payment_sessions(stitch_request_id);

GRANT SELECT, INSERT, UPDATE ON public.stitch_payment_sessions TO authenticated;
GRANT ALL ON public.stitch_payment_sessions TO service_role;

ALTER TABLE public.stitch_payment_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own stitch sessions"
  ON public.stitch_payment_sessions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own stitch sessions"
  ON public.stitch_payment_sessions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Club admins view club stitch sessions"
  ON public.stitch_payment_sessions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = stitch_payment_sessions.club_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'admin'
    )
  );

CREATE TRIGGER stitch_payment_sessions_set_updated_at
  BEFORE UPDATE ON public.stitch_payment_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
