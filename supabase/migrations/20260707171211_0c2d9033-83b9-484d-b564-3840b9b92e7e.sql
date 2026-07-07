ALTER TABLE public.platform_subscription_invoices
  ADD COLUMN IF NOT EXISTS stitch_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS stitch_payment_link TEXT;
CREATE INDEX IF NOT EXISTS idx_platform_sub_invoices_stitch_payment_id
  ON public.platform_subscription_invoices (stitch_payment_id);