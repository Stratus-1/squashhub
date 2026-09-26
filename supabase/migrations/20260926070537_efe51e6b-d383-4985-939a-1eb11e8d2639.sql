CREATE OR REPLACE FUNCTION public.journal_light_fee_on_credit_debit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_amount numeric;
  v_ref uuid;
BEGIN
  IF NEW.status <> 'confirmed' THEN RETURN NEW; END IF;
  IF NEW.club_id IS NULL THEN RETURN NEW; END IF;
  v_amount := abs(NEW.amount);
  IF v_amount = 0 THEN RETURN NEW; END IF;

  IF NEW.type = 'credit' AND NEW.method = 'system'
     AND (NEW.description ILIKE '%court lights%' OR NEW.description ILIKE '%light fee%') THEN
    v_ref := gen_random_uuid();
    INSERT INTO public.club_journal_entries
      (club_id, club_member_id, account, debit, credit, description, journal_ref, transaction_id, created_at)
    VALUES
      (NEW.club_id, NEW.club_member_id, 'debtors', v_amount, 0, NEW.description, v_ref, NEW.id, now()),
      (NEW.club_id, NEW.club_member_id, 'light_fees_income', 0, v_amount, NEW.description, v_ref, NEW.id, now());
    RETURN NEW;
  END IF;

  -- Visitor fees charged when a booking with a visitor starts.
  IF NEW.type = 'credit' AND NEW.method = 'system'
     AND (NEW.description ILIKE 'Visitor fee –%' OR NEW.description ILIKE 'Visitor court fee –%') THEN
    v_ref := gen_random_uuid();
    INSERT INTO public.club_journal_entries
      (club_id, club_member_id, account, debit, credit, description, journal_ref, transaction_id, created_at)
    VALUES
      (NEW.club_id, NEW.club_member_id, 'debtors', v_amount, 0, NEW.description, v_ref, NEW.id, now()),
      (NEW.club_id, NEW.club_member_id, 'visitor_income', 0, v_amount, NEW.description, v_ref, NEW.id, now());
    RETURN NEW;
  END IF;

  IF NEW.type = 'debit' AND NEW.method IN ('card','eft','cash') THEN
    v_ref := gen_random_uuid();
    INSERT INTO public.club_journal_entries
      (club_id, club_member_id, account, debit, credit, description, journal_ref, transaction_id, created_at)
    VALUES
      (NEW.club_id, NEW.club_member_id, 'bank_current', v_amount, 0, COALESCE(NEW.description, 'Member account payment'), v_ref, NEW.id, now()),
      (NEW.club_id, NEW.club_member_id, 'debtors', 0, v_amount, COALESCE(NEW.description, 'Member account payment'), v_ref, NEW.id, now());
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

-- Backfill visitor fees already charged but never posted to the member statement.
WITH missing AS (
  SELECT t.*, gen_random_uuid() AS ref
  FROM public.member_credit_transactions t
  WHERE t.type = 'credit' AND t.method = 'system' AND t.status = 'confirmed'
    AND (t.description ILIKE 'Visitor fee –%' OR t.description ILIKE 'Visitor court fee –%')
    AND NOT EXISTS (SELECT 1 FROM public.club_journal_entries j WHERE j.transaction_id = t.id)
)
INSERT INTO public.club_journal_entries
  (club_id, club_member_id, account, debit, credit, description, journal_ref, transaction_id, created_at)
SELECT club_id, club_member_id, 'debtors'::gl_account, abs(amount), 0, description, ref, id, created_at FROM missing
UNION ALL
SELECT club_id, club_member_id, 'visitor_income'::gl_account, 0, abs(amount), description, ref, id, created_at FROM missing;