
CREATE OR REPLACE FUNCTION public.journal_light_fee_on_credit_debit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_amount numeric;
  v_ref uuid;
BEGIN
  IF NEW.status <> 'confirmed' THEN RETURN NEW; END IF;
  IF NEW.club_id IS NULL THEN RETURN NEW; END IF;

  v_amount := abs(NEW.amount);
  IF v_amount = 0 THEN RETURN NEW; END IF;

  IF NEW.type = 'credit'
     AND NEW.method = 'system'
     AND (NEW.description ILIKE '%court lights%' OR NEW.description ILIKE '%light fee%') THEN
    v_ref := gen_random_uuid();
    INSERT INTO public.club_journal_entries
      (club_id, club_member_id, account, debit, credit, description, journal_ref, transaction_id, created_at)
    VALUES
      (NEW.club_id, NEW.club_member_id, 'debtors',           v_amount, 0, NEW.description, v_ref, NEW.id, now()),
      (NEW.club_id, NEW.club_member_id, 'light_fees_income', 0, v_amount, NEW.description, v_ref, NEW.id, now());
    RETURN NEW;
  END IF;

  IF NEW.type = 'debit' AND NEW.method IN ('card','eft','cash') THEN
    v_ref := gen_random_uuid();
    INSERT INTO public.club_journal_entries
      (club_id, club_member_id, account, debit, credit, description, journal_ref, transaction_id, created_at)
    VALUES
      (NEW.club_id, NEW.club_member_id, 'bank_current', v_amount, 0,
        COALESCE(NEW.description, 'Member account payment'), v_ref, NEW.id, now()),
      (NEW.club_id, NEW.club_member_id, 'debtors',      0, v_amount,
        COALESCE(NEW.description, 'Member account payment'), v_ref, NEW.id, now());
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$function$;

-- Reclassify all existing court-light journal entries from fee_income to light_fees_income
UPDATE public.club_journal_entries
SET account = 'light_fees_income'
WHERE account = 'fee_income'
  AND (description ILIKE '%court lights%' OR description ILIKE '%light fee%');
