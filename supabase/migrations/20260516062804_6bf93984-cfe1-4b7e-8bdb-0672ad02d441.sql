CREATE TABLE public.yoco_payment_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  club_member_id uuid NOT NULL,
  user_id uuid,
  amount numeric NOT NULL CHECK (amount > 0),
  purpose text NOT NULL CHECK (purpose IN ('fee','topup')),
  fee_ids uuid[] NOT NULL DEFAULT '{}',
  description text,
  yoco_checkout_id text,
  yoco_redirect_url text,
  status text NOT NULL DEFAULT 'created' CHECK (status IN ('created','completed','cancelled','failed','expired')),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_yoco_sessions_member ON public.yoco_payment_sessions(club_member_id);
CREATE INDEX idx_yoco_sessions_checkout ON public.yoco_payment_sessions(yoco_checkout_id);

ALTER TABLE public.yoco_payment_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view own yoco sessions"
ON public.yoco_payment_sessions FOR SELECT
USING (
  user_id = auth.uid()
  OR club_member_id IN (
    SELECT id FROM public.club_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Club admins view yoco sessions"
ON public.yoco_payment_sessions FOR SELECT
USING (
  club_id IN (
    SELECT club_id FROM public.club_members
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

CREATE TRIGGER trg_yoco_sessions_updated_at
BEFORE UPDATE ON public.yoco_payment_sessions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();