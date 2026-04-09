ALTER TABLE public.member_fee_categories ADD COLUMN IF NOT EXISTS due_day integer NOT NULL DEFAULT 1;
ALTER TABLE public.league_associations ADD COLUMN IF NOT EXISTS due_day integer NOT NULL DEFAULT 1;
ALTER TABLE public.national_body_fees ADD COLUMN IF NOT EXISTS due_day integer NOT NULL DEFAULT 1;