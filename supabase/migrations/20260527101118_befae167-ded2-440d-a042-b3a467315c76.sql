
-- Fix light-fee accounting: ensure light fee charges and member payments are posted to club ledger
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

  -- Light-fee charge: Dr Debtors / Cr Fee Income
  IF NEW.type = 'charge'
     AND (NEW.description ILIKE '%court lights%' OR NEW.description ILIKE '%light fee%') THEN
    v_ref := gen_random_uuid();
    INSERT INTO public.club_journal_entries
      (club_id, club_member_id, account, debit, credit, description, journal_ref, transaction_id, created_at)
    VALUES
      (NEW.club_id, NEW.club_member_id, 'debtors',    v_amount, 0, NEW.description, v_ref, NEW.id, now()),
      (NEW.club_id, NEW.club_member_id, 'fee_income', 0, v_amount, NEW.description, v_ref, NEW.id, now());
    RETURN NEW;
  END IF;

  -- Member payment received (top-up): Dr Bank / Cr Debtors (clears AR)
  IF NEW.type = 'credit' AND NEW.method <> 'system' THEN
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

DROP TRIGGER IF EXISTS trg_journal_light_fee ON public.member_credit_transactions;
CREATE TRIGGER trg_journal_light_fee
  AFTER INSERT ON public.member_credit_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.journal_light_fee_on_credit_debit();
