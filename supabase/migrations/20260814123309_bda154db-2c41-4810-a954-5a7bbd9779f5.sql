ALTER TABLE public.platform_subscription_invoices
ADD COLUMN IF NOT EXISTS billing_details jsonb;