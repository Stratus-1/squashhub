
ALTER TABLE public.club_association_payable_batches
  DROP CONSTRAINT IF EXISTS club_association_payable_batches_national_body_fee_id_fkey;

ALTER TABLE public.club_association_payable_batches
  ALTER COLUMN national_body_fee_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS payable_fee_id uuid REFERENCES public.club_fees_payable(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS basis text,
  ADD COLUMN IF NOT EXISTS unit_amount numeric(12,2);

CREATE INDEX IF NOT EXISTS idx_capb_payable_fee ON public.club_association_payable_batches(payable_fee_id);
