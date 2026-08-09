ALTER TABLE public.clubs
  ADD COLUMN IF NOT EXISTS whatsapp_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_opted_in_at timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_opted_in_by uuid,
  ADD COLUMN IF NOT EXISTS whatsapp_rate_override numeric(10,4);

ALTER TABLE public.whatsapp_send_log
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'utility',
  ADD COLUMN IF NOT EXISTS unit_cost numeric(10,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS billable boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS invoice_id uuid;

CREATE INDEX IF NOT EXISTS whatsapp_send_log_billing_idx
  ON public.whatsapp_send_log (club_id, created_at)
  WHERE billable AND invoice_id IS NULL;

CREATE TABLE IF NOT EXISTS public.club_whatsapp_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES public.clubs(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  utility_count integer NOT NULL DEFAULT 0,
  service_count integer NOT NULL DEFAULT 0,
  marketing_count integer NOT NULL DEFAULT 0,
  message_count integer NOT NULL DEFAULT 0,
  subtotal numeric(12,2) NOT NULL DEFAULT 0,
  vat_amount numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'ZAR',
  status text NOT NULL DEFAULT 'issued',
  issued_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (club_id, period_start)
);

GRANT SELECT ON public.club_whatsapp_invoices TO authenticated;
GRANT ALL ON public.club_whatsapp_invoices TO service_role;
ALTER TABLE public.club_whatsapp_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Club admins view whatsapp invoices" ON public.club_whatsapp_invoices;
CREATE POLICY "Club admins view whatsapp invoices"
  ON public.club_whatsapp_invoices FOR SELECT TO authenticated
  USING (public.is_club_admin(auth.uid(), club_id) OR public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS "Platform admins manage whatsapp invoices" ON public.club_whatsapp_invoices;
CREATE POLICY "Platform admins manage whatsapp invoices"
  ON public.club_whatsapp_invoices FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.whatsapp_rate(_club_id uuid, _category text DEFAULT 'utility')
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _override numeric;
  _rate numeric;
BEGIN
  SELECT whatsapp_rate_override INTO _override FROM public.clubs WHERE id = _club_id;
  IF _override IS NOT NULL THEN
    RETURN _override;
  END IF;

  SELECT value::numeric INTO _rate
  FROM public.app_settings
  WHERE key = 'whatsapp_rate_' || coalesce(_category, 'utility');

  RETURN coalesce(_rate, 0.45);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_club_whatsapp_usage(
  _club_id uuid,
  _period_start date,
  _period_end date
)
RETURNS TABLE (
  utility_count integer,
  service_count integer,
  marketing_count integer,
  message_count integer,
  subtotal numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    count(*) FILTER (WHERE category = 'utility')::int,
    count(*) FILTER (WHERE category = 'service')::int,
    count(*) FILTER (WHERE category = 'marketing')::int,
    count(*)::int,
    coalesce(sum(unit_cost), 0)::numeric
  FROM public.whatsapp_send_log
  WHERE club_id = _club_id
    AND status = 'sent'
    AND billable
    AND created_at >= _period_start
    AND created_at < (_period_end + 1)
    AND (
      public.is_club_admin(auth.uid(), _club_id)
      OR public.is_platform_admin(auth.uid())
    );
$$;

CREATE OR REPLACE FUNCTION public.generate_club_whatsapp_invoice(
  _club_id uuid,
  _period_start date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _period_end date := (_period_start + interval '1 month' - interval '1 day')::date;
  _u int; _s int; _m int; _n int; _sub numeric; _vat numeric;
  _id uuid;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only platform admins can generate WhatsApp invoices';
  END IF;

  SELECT
    count(*) FILTER (WHERE category = 'utility')::int,
    count(*) FILTER (WHERE category = 'service')::int,
    count(*) FILTER (WHERE category = 'marketing')::int,
    count(*)::int,
    coalesce(sum(unit_cost), 0)::numeric
  INTO _u, _s, _m, _n, _sub
  FROM public.whatsapp_send_log
  WHERE club_id = _club_id
    AND status = 'sent'
    AND billable
    AND invoice_id IS NULL
    AND created_at >= _period_start
    AND created_at < (_period_end + 1);

  IF _n = 0 THEN
    RETURN NULL;
  END IF;

  _vat := round(_sub * 0.15, 2);

  INSERT INTO public.club_whatsapp_invoices (
    club_id, period_start, period_end,
    utility_count, service_count, marketing_count, message_count,
    subtotal, vat_amount, total
  ) VALUES (
    _club_id, _period_start, _period_end,
    _u, _s, _m, _n,
    round(_sub, 2), _vat, round(_sub, 2) + _vat
  )
  ON CONFLICT (club_id, period_start) DO UPDATE SET
    period_end = EXCLUDED.period_end,
    utility_count = public.club_whatsapp_invoices.utility_count + EXCLUDED.utility_count,
    service_count = public.club_whatsapp_invoices.service_count + EXCLUDED.service_count,
    marketing_count = public.club_whatsapp_invoices.marketing_count + EXCLUDED.marketing_count,
    message_count = public.club_whatsapp_invoices.message_count + EXCLUDED.message_count,
    subtotal = public.club_whatsapp_invoices.subtotal + EXCLUDED.subtotal,
    vat_amount = public.club_whatsapp_invoices.vat_amount + EXCLUDED.vat_amount,
    total = public.club_whatsapp_invoices.total + EXCLUDED.total,
    updated_at = now()
  RETURNING id INTO _id;

  UPDATE public.whatsapp_send_log
  SET invoice_id = _id
  WHERE club_id = _club_id
    AND status = 'sent'
    AND billable
    AND invoice_id IS NULL
    AND created_at >= _period_start
    AND created_at < (_period_end + 1);

  RETURN _id;
END;
$$;