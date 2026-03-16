
CREATE OR REPLACE FUNCTION public.journal_light_fee_on_credit_debit()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  -- Only act on confirmed debit transactions that look like light fees
  IF NEW.type <> 'debit' THEN RETURN NEW; END IF;
  IF NEW.status <> 'confirmed' THEN RETURN NEW; END IF;
  IF NEW.description NOT ILIKE '%court lights%' AND NEW.description NOT ILIKE '%light fee%' THEN RETURN NEW; END IF;
  IF NEW.club_id IS NULL THEN RETURN NEW; END IF;

  -- Amount in credit_transactions is negative for debits; journal uses positive values
  DECLARE
    v_amount numeric := abs(NEW.amount);
    v_ref text := 'LIGHT-' || COALESCE(NEW.reference, NEW.id::text);
  BEGIN
    -- Debit Debtors (member owes club)
    INSERT INTO public.club_journal_entries
      (club_id, club_member_id, account, debit, credit, description, journal_ref, transaction_id, created_at)
    VALUES
      (NEW.club_id, NEW.club_member_id, 'debtors', v_amount, 0,
       NEW.description, v_ref, NEW.id, now());

    -- Credit Fee Income (club earns revenue)
    INSERT INTO public.club_journal_entries
      (club_id, club_member_id, account, debit, credit, description, journal_ref, transaction_id, created_at)
    VALUES
      (NEW.club_id, NEW.club_member_id, 'fee_income', 0, v_amount,
       NEW.description, v_ref, NEW.id, now());
  END;

  RETURN NEW;
END;
$$;

-- Fire after insert so the transaction row is committed
DROP TRIGGER IF EXISTS trg_journal_light_fee ON public.member_credit_transactions;
CREATE TRIGGER trg_journal_light_fee
  AFTER INSERT ON public.member_credit_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.journal_light_fee_on_credit_debit();
