
-- Update journal_light_fee trigger to use correct terminology
-- Light fee charges are now type='credit' (fee charged to member)
CREATE OR REPLACE FUNCTION public.journal_light_fee_on_credit_debit()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_amount numeric;
  v_ref uuid;
BEGIN
  -- Only act on confirmed credit transactions (fees charged) that look like light fees
  IF NEW.type <> 'credit' THEN RETURN NEW; END IF;
  IF NEW.status <> 'confirmed' THEN RETURN NEW; END IF;
  IF NEW.description NOT ILIKE '%court lights%' AND NEW.description NOT ILIKE '%light fee%' THEN RETURN NEW; END IF;
  IF NEW.club_id IS NULL THEN RETURN NEW; END IF;

  v_amount := abs(NEW.amount);
  v_ref := gen_random_uuid();

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

  RETURN NEW;
END;
$$;
