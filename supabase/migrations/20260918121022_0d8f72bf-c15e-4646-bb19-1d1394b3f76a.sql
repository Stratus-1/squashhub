ALTER TABLE public.payfast_payment_sessions
  ADD COLUMN IF NOT EXISTS mandate_id uuid REFERENCES public.stitch_mandates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_tokenisation boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_payfast_sessions_mandate
  ON public.payfast_payment_sessions (mandate_id);

GRANT SELECT (mandate_id, is_tokenisation) ON public.payfast_payment_sessions TO authenticated;
GRANT ALL ON public.payfast_payment_sessions TO service_role;