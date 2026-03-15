
ALTER TABLE public.member_fee_categories ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE public.league_associations ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
ALTER TABLE public.national_body_fees ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
