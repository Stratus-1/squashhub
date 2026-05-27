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