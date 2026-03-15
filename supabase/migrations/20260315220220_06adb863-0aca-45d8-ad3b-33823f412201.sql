
ALTER TABLE public.member_fee_categories ADD COLUMN IF NOT EXISTS pro_rate boolean NOT NULL DEFAULT true;
ALTER TABLE public.national_body_fees ADD COLUMN IF NOT EXISTS pro_rate boolean NOT NULL DEFAULT false;
ALTER TABLE public.league_associations ADD COLUMN IF NOT EXISTS pro_rate boolean NOT NULL DEFAULT false;
