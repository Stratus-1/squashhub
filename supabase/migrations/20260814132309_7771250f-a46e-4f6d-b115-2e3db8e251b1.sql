ALTER TABLE public.subscription_plans DROP CONSTRAINT IF EXISTS subscription_plans_billing_cycle_check;
ALTER TABLE public.subscription_plans ADD CONSTRAINT subscription_plans_billing_cycle_check CHECK (billing_cycle IN ('monthly','biannual','annual'));

INSERT INTO public.subscription_plans (name, description, price_per_member, billing_cycle, minimum_charge, active, is_default)
SELECT 'Standard 6-Monthly', 'Per member, six months in advance (5% off) - priced from the sliding scale', 5.70, 'biannual', 0, true, false
WHERE NOT EXISTS (SELECT 1 FROM public.subscription_plans WHERE billing_cycle = 'biannual');