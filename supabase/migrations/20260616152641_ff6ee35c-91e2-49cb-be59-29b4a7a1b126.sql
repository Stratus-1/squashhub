
-- 1) Update assessment trigger: skip future-dated invoices that haven't been issued yet
CREATE OR REPLACE FUNCTION public.journal_fee_assessment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_club_id uuid;
  v_ref uuid;
  v_income_account public.gl_account;
  v_amount numeric;
  v_label text;
  v_ftype text;
BEGIN
  v_amount := COALESCE(NEW.amount, 0);
  IF v_amount <= 0 THEN
    RETURN NEW;
  END IF;

  -- Defer GL posting for future-dated invoices that have not yet been issued
  IF NEW.invoice_issued_at IS NULL
     AND NEW.invoice_due_date IS NOT NULL
     AND NEW.invoice_due_date > CURRENT_DATE THEN
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

  IF NEW.is_pass_through = true OR v_ftype LIKE '%league%' OR v_ftype LIKE '%affiliation%' THEN
    v_income_account := 'league_fees_income';
  ELSIF v_ftype LIKE '%national%' OR v_ftype LIKE '%ssa%' OR v_ftype LIKE '%body%' THEN
    v_income_account := 'national_body_income';
  ELSIF v_ftype LIKE '%bar%' OR v_ftype LIKE '%honesty%' THEN
    v_income_account := 'bar_income';
  ELSIF v_ftype LIKE '%tournament%' OR v_ftype LIKE '%champ%' OR v_ftype LIKE '%tourn%' THEN
    v_income_account := 'tournament_income';
  ELSE
    v_income_account := 'membership_income';
  END IF;

  v_ref := gen_random_uuid();

  INSERT INTO public.club_journal_entries
    (club_id, club_member_id, fee_payment_id, account, debit, credit, description, journal_ref)
  VALUES
    (v_club_id, NEW.club_member_id, NEW.id, 'debtors', v_amount, 0, v_label, v_ref),
    (v_club_id, NEW.club_member_id, NEW.id, v_income_account, 0, v_amount, v_label, v_ref);

  RETURN NEW;
END;
$function$;

-- 2) New trigger: when invoice_issued_at transitions NULL -> NOT NULL, post the GL entries
CREATE OR REPLACE FUNCTION public.journal_fee_issued()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_club_id uuid;
  v_ref uuid;
  v_income_account public.gl_account;
  v_amount numeric;
  v_label text;
  v_ftype text;
  v_exists boolean;
BEGIN
  IF NEW.invoice_issued_at IS NULL OR OLD.invoice_issued_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_amount := COALESCE(NEW.amount, 0);
  IF v_amount <= 0 THEN
    RETURN NEW;
  END IF;

  -- idempotency: skip if assessment journal already posted for this fee_payment
  SELECT EXISTS (
    SELECT 1 FROM public.club_journal_entries
    WHERE fee_payment_id = NEW.id AND account = 'debtors'
  ) INTO v_exists;
  IF v_exists THEN
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

  IF NEW.is_pass_through = true OR v_ftype LIKE '%league%' OR v_ftype LIKE '%affiliation%' THEN
    v_income_account := 'league_fees_income';
  ELSIF v_ftype LIKE '%national%' OR v_ftype LIKE '%ssa%' OR v_ftype LIKE '%body%' THEN
    v_income_account := 'national_body_income';
  ELSIF v_ftype LIKE '%bar%' OR v_ftype LIKE '%honesty%' THEN
    v_income_account := 'bar_income';
  ELSIF v_ftype LIKE '%tournament%' OR v_ftype LIKE '%champ%' OR v_ftype LIKE '%tourn%' THEN
    v_income_account := 'tournament_income';
  ELSE
    v_income_account := 'membership_income';
  END IF;

  v_ref := gen_random_uuid();
  INSERT INTO public.club_journal_entries
    (club_id, club_member_id, fee_payment_id, account, debit, credit, description, journal_ref)
  VALUES
    (v_club_id, NEW.club_member_id, NEW.id, 'debtors', v_amount, 0, v_label, v_ref),
    (v_club_id, NEW.club_member_id, NEW.id, v_income_account, 0, v_amount, v_label, v_ref);

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_journal_fee_issued ON public.club_member_fee_payments;
CREATE TRIGGER trg_journal_fee_issued
AFTER UPDATE OF invoice_issued_at ON public.club_member_fee_payments
FOR EACH ROW EXECUTE FUNCTION public.journal_fee_issued();

-- 3) Update generate_member_renewal_invoices to leave invoice_issued_at NULL
CREATE OR REPLACE FUNCTION public.generate_member_renewal_invoices(p_club_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_due date;
  v_send date;
  v_season int;
  v_label text;
  v_inv text;
  v_seq int;
  v_prefix text;
  v_reminder_days int;
  v_existing record;
  v_created int := 0;
  v_updated int := 0;
  v_skipped_paid int := 0;
  v_skipped_sent int := 0;
BEGIN
  SELECT COALESCE(c.fee_reminder_days_before, 14),
         COALESCE(NULLIF(c.invoice_prefix, ''), 'INV')
    INTO v_reminder_days, v_prefix
  FROM public.clubs c WHERE c.id = p_club_id;

  FOR r IN
    SELECT cm.id AS member_id, cm.fee_category_id, mfc.name AS cat_name,
           mfc.annual_fee, mfc.due_month, mfc.due_day
    FROM public.club_members cm
    JOIN public.member_fee_categories mfc ON mfc.id = cm.fee_category_id
    WHERE cm.club_id = p_club_id
      AND cm.active = true
      AND mfc.annual_fee > 0
  LOOP
    v_due := make_date(
      CASE WHEN make_date(extract(year from CURRENT_DATE)::int, COALESCE(r.due_month,3), COALESCE(r.due_day,1)) > CURRENT_DATE
           THEN extract(year from CURRENT_DATE)::int
           ELSE extract(year from CURRENT_DATE)::int + 1 END,
      COALESCE(r.due_month, 3), COALESCE(r.due_day, 1));
    v_send := v_due - v_reminder_days;
    v_season := extract(year from v_due)::int;
    v_label := 'Renewal Fees ' || v_season || ' — ' || r.cat_name;

    SELECT * INTO v_existing
    FROM public.club_member_fee_payments
    WHERE club_member_id = r.member_id
      AND fee_type = 'renewal'
      AND season_year = v_season
    LIMIT 1;

    IF v_existing.id IS NOT NULL THEN
      IF v_existing.paid THEN
        v_skipped_paid := v_skipped_paid + 1;
      ELSIF v_existing.invoice_email_sent_at IS NOT NULL THEN
        v_skipped_sent := v_skipped_sent + 1;
      ELSE
        UPDATE public.club_member_fee_payments
           SET amount = r.annual_fee,
               fee_label = v_label,
               invoice_due_date = v_due,
               invoice_send_date = v_send,
               updated_at = now()
         WHERE id = v_existing.id;
        v_updated := v_updated + 1;
      END IF;
    ELSE
      UPDATE public.clubs
         SET next_invoice_seq = next_invoice_seq + 1
       WHERE id = p_club_id
       RETURNING next_invoice_seq - 1 INTO v_seq;
      v_inv := v_prefix || '-' || v_season || '-' || lpad(v_seq::text, 5, '0');

      -- NOTE: invoice_issued_at left NULL; GL posting deferred until invoice is actually issued/sent
      INSERT INTO public.club_member_fee_payments
        (club_member_id, fee_type, fee_label, amount, paid, season_year,
         invoice_number, invoice_due_date, invoice_send_date, invoice_email_status)
      VALUES
        (r.member_id, 'renewal', v_label, r.annual_fee, false, v_season,
         v_inv, v_due, v_send, 'pending');
      v_created := v_created + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'created', v_created,
    'updated', v_updated,
    'skipped_paid', v_skipped_paid,
    'skipped_sent', v_skipped_sent
  );
END;
$function$;
