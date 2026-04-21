-- 1) Trigger function: post the assessment when a fee is raised
CREATE OR REPLACE FUNCTION public.journal_fee_assessment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_club_id uuid;
  v_ref uuid;
  v_income_account public.gl_account;
  v_amount numeric;
  v_label text;
  v_ftype text;
BEGIN
  -- Skip zero-amount fees (e.g. honorary)
  v_amount := COALESCE(NEW.amount, 0);
  IF v_amount <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT cm.club_id INTO v_club_id
  FROM public.club_members cm
  WHERE cm.id = NEW.club_member_id;

  IF v_club_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_ftype := lower(COALESCE(NEW.fee_type, ''));
  v_label := 'Fee raised: ' || COALESCE(NEW.fee_label, 'membership');

  -- Choose income account based on fee_type / pass-through nature
  -- Pass-through league fees flow through league_fees_income so the existing
  -- settle_pass_through_fee trigger can offset them with league_fees_expense / association_payable.
  IF NEW.is_pass_through = true OR v_ftype LIKE '%league%' OR v_ftype LIKE '%affiliation%' THEN
    v_income_account := 'league_fees_income';
  ELSIF v_ftype LIKE '%national%' OR v_ftype LIKE '%ssa%' OR v_ftype LIKE '%body%' THEN
    v_income_account := 'national_body_income';
  ELSIF v_ftype LIKE '%bar%' OR v_ftype LIKE '%honesty%' THEN
    v_income_account := 'bar_income';
  ELSE
    v_income_account := 'membership_income';
  END IF;

  v_ref := gen_random_uuid();

  -- Dr Debtors (member owes the club)
  -- Cr Income (club has earned the fee on accrual basis)
  INSERT INTO public.club_journal_entries
    (club_id, club_member_id, fee_payment_id, account, debit, credit, description, journal_ref)
  VALUES
    (v_club_id, NEW.club_member_id, NEW.id, 'debtors', v_amount, 0, v_label, v_ref),
    (v_club_id, NEW.club_member_id, NEW.id, v_income_account, 0, v_amount, v_label, v_ref);

  RETURN NEW;
END;
$$;

-- 2) Trigger function: clear debtor + record cash when fee is paid
CREATE OR REPLACE FUNCTION public.journal_fee_payment_received()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_club_id uuid;
  v_ref uuid;
  v_amount numeric;
  v_label text;
  v_already integer;
BEGIN
  -- Only fire on false -> true paid transition
  IF NEW.paid IS NOT TRUE THEN RETURN NEW; END IF;
  IF OLD.paid IS TRUE THEN RETURN NEW; END IF;

  -- Use the original assessed amount (not the current row amount, which may be zeroed by partial flow)
  -- Look up the corresponding Debtor entry posted on assessment.
  SELECT debit INTO v_amount
  FROM public.club_journal_entries
  WHERE fee_payment_id = NEW.id
    AND account = 'debtors'::public.gl_account
    AND debit > 0
  ORDER BY created_at ASC
  LIMIT 1;

  -- Fallback to current amount if no assessment entry was found
  IF v_amount IS NULL OR v_amount <= 0 THEN
    v_amount := COALESCE(NEW.amount, 0);
  END IF;
  IF v_amount <= 0 THEN RETURN NEW; END IF;

  -- Idempotency guard — don't post twice for the same fee payment
  SELECT count(*) INTO v_already
  FROM public.club_journal_entries
  WHERE fee_payment_id = NEW.id
    AND account = 'debtors'::public.gl_account
    AND credit > 0;
  IF v_already > 0 THEN
    RETURN NEW;
  END IF;

  SELECT cm.club_id INTO v_club_id
  FROM public.club_members cm
  WHERE cm.id = NEW.club_member_id;
  IF v_club_id IS NULL THEN RETURN NEW; END IF;

  v_ref := gen_random_uuid();
  v_label := 'Fee paid: ' || COALESCE(NEW.fee_label, 'membership');

  -- Dr Bank (money received)  Cr Debtors (member's balance cleared)
  INSERT INTO public.club_journal_entries
    (club_id, club_member_id, fee_payment_id, account, debit, credit, description, journal_ref)
  VALUES
    (v_club_id, NEW.club_member_id, NEW.id, 'bank_current', v_amount, 0, v_label, v_ref),
    (v_club_id, NEW.club_member_id, NEW.id, 'debtors',     0, v_amount, v_label, v_ref);

  RETURN NEW;
END;
$$;

-- 3) Attach the triggers
DROP TRIGGER IF EXISTS trg_journal_fee_assessment ON public.club_member_fee_payments;
CREATE TRIGGER trg_journal_fee_assessment
AFTER INSERT ON public.club_member_fee_payments
FOR EACH ROW EXECUTE FUNCTION public.journal_fee_assessment();

DROP TRIGGER IF EXISTS trg_journal_fee_payment_received ON public.club_member_fee_payments;
CREATE TRIGGER trg_journal_fee_payment_received
AFTER UPDATE OF paid ON public.club_member_fee_payments
FOR EACH ROW EXECUTE FUNCTION public.journal_fee_payment_received();

-- 4) Light backfill: post assessment entries for fees raised in the last 24h
--    (so today's testing data is reflected in the GL)
DO $$
DECLARE
  r record;
  v_ref uuid;
  v_income_account public.gl_account;
  v_ftype text;
  v_already integer;
BEGIN
  FOR r IN
    SELECT fp.id, fp.club_member_id, fp.amount, fp.fee_label, fp.fee_type, fp.is_pass_through, fp.paid, cm.club_id
    FROM public.club_member_fee_payments fp
    JOIN public.club_members cm ON cm.id = fp.club_member_id
    WHERE fp.created_at >= now() - interval '24 hours'
      AND COALESCE(fp.amount, 0) > 0
  LOOP
    -- Skip if assessment entry already exists
    SELECT count(*) INTO v_already
    FROM public.club_journal_entries
    WHERE fee_payment_id = r.id
      AND account = 'debtors'::public.gl_account
      AND debit > 0;
    IF v_already > 0 THEN CONTINUE; END IF;

    v_ftype := lower(COALESCE(r.fee_type, ''));
    IF r.is_pass_through = true OR v_ftype LIKE '%league%' OR v_ftype LIKE '%affiliation%' THEN
      v_income_account := 'league_fees_income';
    ELSIF v_ftype LIKE '%national%' OR v_ftype LIKE '%ssa%' OR v_ftype LIKE '%body%' THEN
      v_income_account := 'national_body_income';
    ELSIF v_ftype LIKE '%bar%' OR v_ftype LIKE '%honesty%' THEN
      v_income_account := 'bar_income';
    ELSE
      v_income_account := 'membership_income';
    END IF;

    v_ref := gen_random_uuid();
    INSERT INTO public.club_journal_entries
      (club_id, club_member_id, fee_payment_id, account, debit, credit, description, journal_ref)
    VALUES
      (r.club_id, r.club_member_id, r.id, 'debtors', r.amount, 0, 'Fee raised (backfill): ' || COALESCE(r.fee_label,'membership'), v_ref),
      (r.club_id, r.club_member_id, r.id, v_income_account, 0, r.amount, 'Fee raised (backfill): ' || COALESCE(r.fee_label,'membership'), v_ref);

    -- If already paid, also post the payment-received pair (clearing debtors)
    IF r.paid = true THEN
      SELECT count(*) INTO v_already
      FROM public.club_journal_entries
      WHERE fee_payment_id = r.id
        AND account = 'debtors'::public.gl_account
        AND credit > 0;
      IF v_already = 0 THEN
        v_ref := gen_random_uuid();
        INSERT INTO public.club_journal_entries
          (club_id, club_member_id, fee_payment_id, account, debit, credit, description, journal_ref)
        VALUES
          (r.club_id, r.club_member_id, r.id, 'bank_current', r.amount, 0, 'Fee paid (backfill): ' || COALESCE(r.fee_label,'membership'), v_ref),
          (r.club_id, r.club_member_id, r.id, 'debtors',     0, r.amount, 'Fee paid (backfill): ' || COALESCE(r.fee_label,'membership'), v_ref);
      END IF;
    END IF;
  END LOOP;
END $$;