ALTER TABLE public.club_secrets
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS bank_account_name text,
  ADD COLUMN IF NOT EXISTS bank_account_number text,
  ADD COLUMN IF NOT EXISTS bank_branch_code text,
  ADD COLUMN IF NOT EXISTS bank_reference text;