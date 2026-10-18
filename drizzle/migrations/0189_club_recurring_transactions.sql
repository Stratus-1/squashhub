CREATE TABLE public.club_recurring_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('income','expense')),
  account text NOT NULL,
  method text NOT NULL CHECK (method IN ('bank','cash','card')),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  description text NOT NULL,
  member_id uuid,
  frequency text NOT NULL CHECK (frequency IN ('weekly','monthly','quarterly','yearly')),
  next_due date NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX club_recurring_transactions_due ON public.club_recurring_transactions (club_id, next_due) WHERE active;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_recurring_transactions TO authenticated;
GRANT ALL ON public.club_recurring_transactions TO service_role;
ALTER TABLE public.club_recurring_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Finance manages recurring transactions" ON public.club_recurring_transactions
  FOR ALL TO authenticated
  USING (public.is_club_admin_or_permitted(auth.uid(), club_id, 'finance'))
  WITH CHECK (public.is_club_admin_or_permitted(auth.uid(), club_id, 'finance'));