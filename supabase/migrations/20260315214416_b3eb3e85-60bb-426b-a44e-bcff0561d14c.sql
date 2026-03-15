
ALTER TABLE public.member_fee_categories
  ADD COLUMN IF NOT EXISTS fee_class text NOT NULL DEFAULT 'club_income';

ALTER TABLE public.national_body_fees
  ADD COLUMN IF NOT EXISTS fee_class text NOT NULL DEFAULT 'pass_through';
