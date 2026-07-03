
CREATE TABLE public.platform_subscription_invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_number TEXT NOT NULL UNIQUE,
  club_id UUID NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES public.club_subscriptions(id) ON DELETE SET NULL,
  plan_id UUID REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
  plan_name TEXT NOT NULL,
  billing_cycle TEXT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  member_count INTEGER NOT NULL DEFAULT 0,
  price_per_member NUMERIC(10,2) NOT NULL DEFAULT 0,
  minimum_charge NUMERIC(10,2) NOT NULL DEFAULT 0,
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  vat_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'ZAR',
  status TEXT NOT NULL DEFAULT 'issued',
  issued_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  due_date DATE,
  paid_at TIMESTAMP WITH TIME ZONE,
  email_sent_at TIMESTAMP WITH TIME ZONE,
  email_status TEXT,
  snapshot JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.platform_subscription_invoices TO authenticated;
GRANT ALL ON public.platform_subscription_invoices TO service_role;

ALTER TABLE public.platform_subscription_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admins can manage all invoices"
  ON public.platform_subscription_invoices FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Club admins can view their own invoices"
  ON public.platform_subscription_invoices FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.club_members cm
      WHERE cm.club_id = platform_subscription_invoices.club_id
        AND cm.user_id = auth.uid()
        AND cm.role = 'admin'
    )
  );

CREATE INDEX idx_psi_club ON public.platform_subscription_invoices(club_id, issued_at DESC);
CREATE INDEX idx_psi_period ON public.platform_subscription_invoices(period_start, period_end);

CREATE TRIGGER update_platform_subscription_invoices_updated_at
  BEFORE UPDATE ON public.platform_subscription_invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
