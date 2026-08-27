CREATE OR REPLACE FUNCTION public.post_journal(p_club_id uuid, p_lines jsonb, p_ref uuid DEFAULT gen_random_uuid(), p_description text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_line jsonb;
  v_total_dr numeric := 0;
  v_total_cr numeric := 0;
  v_touched_members uuid[] := ARRAY[]::uuid[];
  v_batch_touches_credits boolean := false;
  v_member_id uuid;
  v_debtors_bal numeric;
  v_credit_bal numeric;
  v_settle numeric;
  v_settle_ref uuid;
  v_custom_id uuid;
BEGIN
  IF p_club_id IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) < 2 THEN
    RAISE EXCEPTION 'post_journal: need club_id and >=2 lines';
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_total_dr := v_total_dr + COALESCE((v_line->>'debit')::numeric, 0);
    v_total_cr := v_total_cr + COALESCE((v_line->>'credit')::numeric, 0);
    IF (v_line->>'account') = 'member_credits' THEN
      v_batch_touches_credits := true;
    END IF;
    IF NULLIF(v_line->>'member_id','') IS NOT NULL THEN
      v_touched_members := array_append(v_touched_members, (v_line->>'member_id')::uuid);
    END IF;
    v_custom_id := NULLIF(v_line->>'custom_account_id','')::uuid;
    IF v_custom_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.club_gl_accounts g WHERE g.id = v_custom_id AND g.club_id = p_club_id
    ) THEN
      RAISE EXCEPTION 'post_journal: custom account % does not belong to this club', v_custom_id;
    END IF;
  END LOOP;

  IF ROUND(v_total_dr, 2) <> ROUND(v_total_cr, 2) THEN
    RAISE EXCEPTION 'post_journal: unbalanced (Dr=% Cr=%)', v_total_dr, v_total_cr;
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    INSERT INTO public.club_journal_entries(
      club_id, journal_ref, account, debit, credit,
      description, club_member_id, fee_payment_id, custom_account_id
    ) VALUES (
      p_club_id, p_ref,
      (v_line->>'account')::gl_account,
      COALESCE((v_line->>'debit')::numeric, 0),
      COALESCE((v_line->>'credit')::numeric, 0),
      COALESCE(v_line->>'description', p_description),
      NULLIF(v_line->>'member_id','')::uuid,
      NULLIF(v_line->>'payment_id','')::uuid,
      NULLIF(v_line->>'custom_account_id','')::uuid
    );
  END LOOP;

  IF NOT v_batch_touches_credits THEN
    FOREACH v_member_id IN ARRAY (SELECT ARRAY(SELECT DISTINCT unnest(v_touched_members))) LOOP
      SELECT COALESCE(SUM(debit) - SUM(credit), 0) INTO v_debtors_bal
        FROM public.club_journal_entries
        WHERE club_id = p_club_id AND club_member_id = v_member_id AND account = 'debtors';
      SELECT COALESCE(SUM(credit) - SUM(debit), 0) INTO v_credit_bal
        FROM public.club_journal_entries
        WHERE club_id = p_club_id AND club_member_id = v_member_id AND account = 'member_credits';

      v_settle := LEAST(GREATEST(v_debtors_bal, 0), GREATEST(v_credit_bal, 0));
      IF ROUND(v_settle, 2) > 0 THEN
        v_settle_ref := gen_random_uuid();
        INSERT INTO public.club_journal_entries(
          club_id, journal_ref, account, debit, credit, description, club_member_id
        ) VALUES
          (p_club_id, v_settle_ref, 'member_credits', v_settle, 0,
           'Auto-settled from prepaid credit', v_member_id),
          (p_club_id, v_settle_ref, 'debtors', 0, v_settle,
           'Auto-settled from prepaid credit', v_member_id);

        UPDATE public.club_member_fee_payments
        SET paid = true, paid_at = COALESCE(paid_at, now())
        WHERE id IN (
          SELECT id FROM public.club_member_fee_payments
          WHERE club_member_id = v_member_id AND COALESCE(paid, false) = false
          ORDER BY created_at ASC
        )
        AND amount <= v_settle;
      END IF;
    END LOOP;
  END IF;

  RETURN p_ref;
END;
$function$;