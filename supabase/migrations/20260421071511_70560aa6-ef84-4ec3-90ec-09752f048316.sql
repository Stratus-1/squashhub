-- 1. Add new GL account for what the club owes a linked league association
ALTER TYPE public.gl_account ADD VALUE IF NOT EXISTS 'association_payable';

-- 2. Add pass-through fields to fee payments
ALTER TABLE public.club_member_fee_payments
  ADD COLUMN IF NOT EXISTS is_pass_through boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS linked_fee_payment_id uuid REFERENCES public.club_member_fee_payments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fee_payments_linked
  ON public.club_member_fee_payments(linked_fee_payment_id)
  WHERE linked_fee_payment_id IS NOT NULL;