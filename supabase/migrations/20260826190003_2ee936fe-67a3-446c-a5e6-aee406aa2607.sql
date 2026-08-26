CREATE TABLE public.club_bank_statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  source_format text NOT NULL DEFAULT 'csv',
  account gl_account NOT NULL DEFAULT 'bank_current',
  period_start date,
  period_end date,
  opening_balance numeric,
  closing_balance numeric,
  is_first_statement boolean NOT NULL DEFAULT false,
  row_count integer NOT NULL DEFAULT 0,
  imported_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE public.club_bank_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  statement_id uuid REFERENCES public.club_bank_statements(id) ON DELETE CASCADE,
  txn_date date NOT NULL,
  description text NOT NULL DEFAULT '',
  reference text,
  amount numeric NOT NULL,
  balance numeric,
  fingerprint text NOT NULL,
  status text NOT NULL DEFAULT 'unmatched',
  matched_account gl_account,
  matched_member_id uuid REFERENCES public.club_members(id) ON DELETE SET NULL,
  journal_ref uuid,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT club_bank_transactions_status_chk CHECK (status IN ('unmatched','posted','ignored'))
);

CREATE UNIQUE INDEX club_bank_txn_fingerprint_uidx ON public.club_bank_transactions (club_id, fingerprint);
CREATE INDEX club_bank_txn_club_date_idx ON public.club_bank_transactions (club_id, txn_date DESC);
CREATE INDEX club_bank_txn_statement_idx ON public.club_bank_transactions (statement_id);
CREATE INDEX club_bank_statements_club_idx ON public.club_bank_statements (club_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_bank_statements TO authenticated;
GRANT ALL ON public.club_bank_statements TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_bank_transactions TO authenticated;
GRANT ALL ON public.club_bank_transactions TO service_role;

ALTER TABLE public.club_bank_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.club_bank_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Club admins manage bank statements" ON public.club_bank_statements
  FOR ALL TO authenticated
  USING (public.is_club_admin(auth.uid(), club_id))
  WITH CHECK (public.is_club_admin(auth.uid(), club_id));

CREATE POLICY "Super admins manage bank statements" ON public.club_bank_statements
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Club admins manage bank transactions" ON public.club_bank_transactions
  FOR ALL TO authenticated
  USING (public.is_club_admin(auth.uid(), club_id))
  WITH CHECK (public.is_club_admin(auth.uid(), club_id));

CREATE POLICY "Super admins manage bank transactions" ON public.club_bank_transactions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_club_bank_statements_updated
  BEFORE UPDATE ON public.club_bank_statements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_club_bank_transactions_updated
  BEFORE UPDATE ON public.club_bank_transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();