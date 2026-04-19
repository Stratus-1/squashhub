ALTER TABLE public.league_associations
ADD COLUMN IF NOT EXISTS members_pay_directly boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.league_associations.members_pay_directly IS
'When true, members pay the league association directly (EFT/card) and the fee is NOT added to the club fee schedule. When false, the association fee is collected by the club via the Fees table.';