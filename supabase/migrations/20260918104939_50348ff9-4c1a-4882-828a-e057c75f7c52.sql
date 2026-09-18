CREATE TABLE public.payfast_payment_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  club_id uuid NOT NULL,
  club_member_id uuid NOT NULL,
  user_id uuid NOT NULL,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'ZAR',
  purpose text NOT NULL,
  fee_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  champ_registration_id uuid,
  description text,
  status text NOT NULL DEFAULT 'created',
  payfast_payment_id text,
  payfast_redirect_url text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.payfast_payment_sessions TO authenticated;
GRANT ALL ON public.payfast_payment_sessions TO service_role;

ALTER TABLE public.payfast_payment_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view own payfast sessions"
ON public.payfast_payment_sessions
FOR SELECT
USING (
  (user_id = auth.uid())
  OR (club_member_id IN (SELECT club_members.id FROM public.club_members WHERE club_members.user_id = auth.uid()))
);

CREATE POLICY "Club admins view payfast sessions"
ON public.payfast_payment_sessions
FOR SELECT
USING (
  club_id IN (
    SELECT club_members.club_id FROM public.club_members
    WHERE club_members.user_id = auth.uid() AND club_members.role = 'admin'::club_member_role
  )
);

CREATE INDEX idx_payfast_sessions_user_created ON public.payfast_payment_sessions (user_id, created_at DESC);
CREATE INDEX idx_payfast_sessions_club ON public.payfast_payment_sessions (club_id, created_at DESC);

CREATE TRIGGER update_payfast_sessions_updated_at
BEFORE UPDATE ON public.payfast_payment_sessions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();