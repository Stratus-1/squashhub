CREATE OR REPLACE FUNCTION public.settle_pass_through_fee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_club_id uuid;
  v_ref uuid;
  v_label text;
BEGIN
  -- Only act when paid flips false -> true on a pass-through fee
  IF NOT NEW.is_pass_through THEN RETURN NEW; END IF;
  IF NEW.paid IS NOT TRUE THEN RETURN NEW; END IF;
  IF OLD.paid IS TRUE THEN RETURN NEW; END IF;

  SELECT cm.club_id INTO v_club_id
  FROM public.club_members cm
  WHERE cm.id = NEW.club_member_id;

  IF v_club_id IS NULL THEN RETURN NEW; END IF;

  v_ref := gen_random_uuid();
  v_label := 'Pass-through fee paid: ' || COALESCE(NEW.fee_label, 'league affiliation');

  -- Member's debt to the club is cleared, club recognises liability to the league.
  -- (Cash receipt itself is journaled separately by the existing payment flow that
  --  marks the fee paid; here we add the onward-payable leg.)
  -- Dr Debtors (reverse the original member-owes-club entry)
  --   handled by existing payment flow when fee is marked paid -> we only add:
  -- Cr Association Payable (club now owes LS)
  -- Dr Fee Income / Cr Association Payable would double-count, so instead we
  -- model: on fee mark-paid, the cash leg already lives in the payment flow.
  -- Here we ONLY add the onward-payable journal pair so the club's books reflect
  -- the liability to the league:
  --   Dr League Fees Expense (club's cost of forwarding)  
  --   Cr Association Payable (club owes the league)

  INSERT INTO public.club_journal_entries
    (club_id, club_member_id, fee_payment_id, account, debit, credit, description, journal_ref)
  VALUES
    (v_club_id, NEW.club_member_id, NEW.id, 'league_fees_expense', NEW.amount, 0, v_label, v_ref),
    (v_club_id, NEW.club_member_id, NEW.id, 'association_payable', 0, NEW.amount, v_label, v_ref);

  -- Auto-settle the linked fee on the association tenant
  IF NEW.linked_fee_payment_id IS NOT NULL THEN
    UPDATE public.club_member_fee_payments
    SET paid = true,
        paid_at = COALESCE(paid_at, now()),
        updated_at = now()
    WHERE id = NEW.linked_fee_payment_id
      AND paid = false;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS settle_pass_through_fee_trg ON public.club_member_fee_payments;
CREATE TRIGGER settle_pass_through_fee_trg
AFTER UPDATE OF paid ON public.club_member_fee_payments
FOR EACH ROW
WHEN (NEW.is_pass_through = true)
EXECUTE FUNCTION public.settle_pass_through_fee();