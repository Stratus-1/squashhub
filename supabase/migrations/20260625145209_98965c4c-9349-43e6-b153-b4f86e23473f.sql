
ALTER TABLE public.member_fee_categories
  ADD COLUMN IF NOT EXISTS debit_order_eligible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS debit_order_rail text NOT NULL DEFAULT 'either' CHECK (debit_order_rail IN ('debicheck','eft','either'));

ALTER TABLE public.league_associations
  ADD COLUMN IF NOT EXISTS debit_order_eligible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS debit_order_rail text NOT NULL DEFAULT 'either' CHECK (debit_order_rail IN ('debicheck','eft','either'));

ALTER TABLE public.national_body_fees
  ADD COLUMN IF NOT EXISTS debit_order_eligible boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS debit_order_rail text NOT NULL DEFAULT 'either' CHECK (debit_order_rail IN ('debicheck','eft','either'));
