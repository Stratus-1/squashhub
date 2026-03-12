
-- Credit transactions ledger (top-ups, payments, refunds)
CREATE TABLE public.member_credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  amount numeric NOT NULL,
  type text NOT NULL DEFAULT 'topup',
  method text DEFAULT 'eft',
  description text DEFAULT '',
  reference text DEFAULT NULL,
  status text NOT NULL DEFAULT 'pending',
  proof_url text DEFAULT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz DEFAULT NULL,
  confirmed_by uuid DEFAULT NULL
);

ALTER TABLE public.member_credit_transactions ENABLE ROW LEVEL SECURITY;

-- Users can view own transactions
CREATE POLICY "Users can view own credit transactions"
  ON public.member_credit_transactions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can insert own transactions (top-up requests, payments)
CREATE POLICY "Users can insert own credit transactions"
  ON public.member_credit_transactions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Admins can update transactions (confirm payments)
CREATE POLICY "Admins can update credit transactions"
  ON public.member_credit_transactions FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Fee payment tracking
CREATE TABLE public.fee_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  fee_type text NOT NULL DEFAULT 'membership',
  fee_label text NOT NULL DEFAULT '',
  amount numeric NOT NULL DEFAULT 0,
  due_date date DEFAULT NULL,
  paid boolean NOT NULL DEFAULT false,
  paid_at timestamptz DEFAULT NULL,
  payment_method text DEFAULT NULL,
  transaction_id uuid DEFAULT NULL REFERENCES public.member_credit_transactions(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fee_payments ENABLE ROW LEVEL SECURITY;

-- Users can view own fee payments
CREATE POLICY "Users can view own fee payments"
  ON public.fee_payments FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can update own fee payments (mark as paid)
CREATE POLICY "Users can update own fee payments"
  ON public.fee_payments FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- Admins can manage fee payments
CREATE POLICY "Admins can manage fee payments"
  ON public.fee_payments FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Users can insert own fee payments
CREATE POLICY "Users can insert own fee payments"
  ON public.fee_payments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
