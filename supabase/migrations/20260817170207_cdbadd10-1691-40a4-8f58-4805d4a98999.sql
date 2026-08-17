ALTER TABLE public.bar_visitor_sales
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'recorded',
  ADD COLUMN IF NOT EXISTS payment_reference text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bar_visitor_sales_payment_status_check'
  ) THEN
    ALTER TABLE public.bar_visitor_sales
      ADD CONSTRAINT bar_visitor_sales_payment_status_check
      CHECK (payment_status IN ('recorded','pending','paid','failed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_bar_visitor_sales_payment_ref
  ON public.bar_visitor_sales(payment_reference);

CREATE OR REPLACE FUNCTION public.qr_bar_sale_status(_sale_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'status', s.payment_status,
    'total', s.total,
    'item_name', b.name
  )
  FROM public.bar_visitor_sales s
  JOIN public.bar_items b ON b.id = s.bar_item_id
  WHERE s.id = _sale_id;
$$;

GRANT EXECUTE ON FUNCTION public.qr_bar_sale_status(uuid) TO anon, authenticated;