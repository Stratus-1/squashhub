ALTER TABLE public.stitch_mandates
  ADD COLUMN IF NOT EXISTS payfast_token text,
  ADD COLUMN IF NOT EXISTS next_charge_date date,
  ADD COLUMN IF NOT EXISTS months_total integer,
  ADD COLUMN IF NOT EXISTS months_charged integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_failure_reason text;

ALTER TABLE public.stitch_mandates DROP CONSTRAINT IF EXISTS stitch_mandates_rail_check;
ALTER TABLE public.stitch_mandates
  ADD CONSTRAINT stitch_mandates_rail_check
  CHECK (rail = ANY (ARRAY['debicheck'::text, 'eft_debit'::text, 'card'::text]));

ALTER TABLE public.stitch_collections
  ADD COLUMN IF NOT EXISTS gateway text NOT NULL DEFAULT 'stitch',
  ADD COLUMN IF NOT EXISTS payfast_payment_id text;

CREATE INDEX IF NOT EXISTS idx_stitch_mandates_next_charge
  ON public.stitch_mandates (next_charge_date)
  WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS uq_stitch_collections_mandate_due
  ON public.stitch_collections (mandate_id, due_date)
  WHERE mandate_id IS NOT NULL;

GRANT SELECT (payfast_token, next_charge_date, months_total, months_charged, last_failure_reason)
  ON public.stitch_mandates TO authenticated;
GRANT SELECT (gateway, payfast_payment_id) ON public.stitch_collections TO authenticated;
GRANT ALL ON public.stitch_mandates TO service_role;
GRANT ALL ON public.stitch_collections TO service_role;