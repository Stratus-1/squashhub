
ALTER TABLE public.platform_subscription_invoices
  ADD COLUMN IF NOT EXISTS display_currency text,
  ADD COLUMN IF NOT EXISTS display_price_per_member numeric,
  ADD COLUMN IF NOT EXISTS display_total numeric,
  ADD COLUMN IF NOT EXISTS fx_rate_to_zar numeric;
