ALTER TABLE public.platform_subscription_invoices
  ADD COLUMN IF NOT EXISTS billing_month date,
  ADD COLUMN IF NOT EXISTS line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS subscription_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS whatsapp_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS whatsapp_message_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS invoice_kind text NOT NULL DEFAULT 'subscription';

UPDATE public.platform_subscription_invoices
SET billing_month = date_trunc('month', COALESCE(issued_at, now()))::date
WHERE billing_month IS NULL;

UPDATE public.platform_subscription_invoices
SET subscription_amount = subtotal
WHERE subscription_amount = 0 AND subtotal <> 0;

CREATE UNIQUE INDEX IF NOT EXISTS platform_subscription_invoices_club_month_uniq
  ON public.platform_subscription_invoices (club_id, billing_month)
  WHERE billing_month IS NOT NULL AND status <> 'void';

ALTER TABLE public.whatsapp_send_log
  ADD COLUMN IF NOT EXISTS platform_invoice_id uuid REFERENCES public.platform_subscription_invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS whatsapp_send_log_platform_invoice_idx
  ON public.whatsapp_send_log (club_id, platform_invoice_id);