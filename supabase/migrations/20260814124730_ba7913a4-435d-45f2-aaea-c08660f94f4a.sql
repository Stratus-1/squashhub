ALTER TABLE public.clubs ADD COLUMN IF NOT EXISTS allow_biannual_billing boolean NOT NULL DEFAULT false;

-- Clubs already allowed annual upfront keep both options available
UPDATE public.clubs SET allow_biannual_billing = true WHERE allow_annual_billing = true;