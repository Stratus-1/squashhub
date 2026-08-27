CREATE TABLE public.club_gl_accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('Asset','Liability','Income','Expense')),
  base_account public.gl_account NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.club_gl_accounts TO authenticated;
GRANT ALL ON public.club_gl_accounts TO service_role;

ALTER TABLE public.club_gl_accounts ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX club_gl_accounts_club_name_uniq ON public.club_gl_accounts (club_id, lower(name));
CREATE INDEX club_gl_accounts_club_idx ON public.club_gl_accounts (club_id);

CREATE POLICY "Club admins manage own GL accounts"
ON public.club_gl_accounts FOR ALL TO authenticated
USING (public.is_club_admin(auth.uid(), club_id))
WITH CHECK (public.is_club_admin(auth.uid(), club_id));

CREATE POLICY "Super admins manage GL accounts"
ON public.club_gl_accounts FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_club_gl_accounts_updated_at
BEFORE UPDATE ON public.club_gl_accounts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.club_journal_entries
  ADD COLUMN custom_account_id uuid REFERENCES public.club_gl_accounts(id) ON DELETE SET NULL;
CREATE INDEX idx_journal_custom_account ON public.club_journal_entries (club_id, custom_account_id) WHERE custom_account_id IS NOT NULL;

ALTER TABLE public.club_bank_transactions
  ADD COLUMN matched_custom_account_id uuid REFERENCES public.club_gl_accounts(id) ON DELETE SET NULL;