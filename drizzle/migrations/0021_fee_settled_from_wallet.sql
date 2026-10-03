ALTER TABLE public.club_member_fee_payments ADD COLUMN IF NOT EXISTS settled_from_wallet boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.club_member_fee_payments.settled_from_wallet IS 'True when the fee was settled from member wallet credit; the top-up already posted Dr bank / Cr debtors, so no second bank receipt is journaled.';

CREATE OR REPLACE FUNCTION public.journal_fee_payment_received()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_club_id uuid; v_ref uuid; v_amount numeric; v_credited numeric; v_label text;
BEGIN
  IF NEW.paid IS NOT TRUE THEN RETURN NEW; END IF;
  IF OLD.paid IS TRUE THEN RETURN NEW; END IF;
  -- Wallet settlement: money was already banked and credited to debtors at top-up time.
  IF NEW.settled_from_wallet IS TRUE THEN RETURN NEW; END IF;

  SELECT debit INTO v_amount FROM public.club_journal_entries
  WHERE fee_payment_id = NEW.id AND account = 'debtors'::public.gl_account AND debit > 0
  ORDER BY created_at ASC LIMIT 1;
  IF v_amount IS NULL OR v_amount <= 0 THEN v_amount := COALESCE(NEW.amount, 0); END IF;

  SELECT COALESCE(sum(credit), 0) INTO v_credited FROM public.club_journal_entries
  WHERE fee_payment_id = NEW.id AND account = 'debtors'::public.gl_account AND credit > 0;
  v_amount := v_amount - COALESCE(v_credited, 0);
  IF v_amount <= 0 THEN RETURN NEW; END IF;

  SELECT cm.club_id INTO v_club_id FROM public.club_members cm WHERE cm.id = NEW.club_member_id;
  IF v_club_id IS NULL THEN RETURN NEW; END IF;

  v_ref := gen_random_uuid();
  v_label := 'Fee paid: ' || COALESCE(NEW.fee_label, 'membership');
  INSERT INTO public.club_journal_entries
    (club_id, club_member_id, fee_payment_id, account, debit, credit, description, journal_ref)
  VALUES
    (v_club_id, NEW.club_member_id, NEW.id, 'bank_current', v_amount, 0, v_label, v_ref),
    (v_club_id, NEW.club_member_id, NEW.id, 'debtors', 0, v_amount, v_label, v_ref);
  RETURN NEW;
END; $$;