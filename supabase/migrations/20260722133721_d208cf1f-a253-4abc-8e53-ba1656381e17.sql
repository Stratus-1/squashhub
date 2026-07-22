
-- 1) Rewrite post_journal to auto-settle debtors from member_credits after each batch
CREATE OR REPLACE FUNCTION public.post_journal(
  p_club_id uuid,
  p_lines jsonb,
  p_ref uuid DEFAULT gen_random_uuid(),
  p_description text DEFAULT NULL::text
)
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
  END LOOP;

  IF ROUND(v_total_dr, 2) <> ROUND(v_total_cr, 2) THEN
    RAISE EXCEPTION 'post_journal: unbalanced (Dr=% Cr=%)', v_total_dr, v_total_cr;
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    INSERT INTO public.club_journal_entries(
      club_id, journal_ref, account, debit, credit,
      description, club_member_id, fee_payment_id
    ) VALUES (
      p_club_id, p_ref,
      (v_line->>'account')::gl_account,
      COALESCE((v_line->>'debit')::numeric, 0),
      COALESCE((v_line->>'credit')::numeric, 0),
      COALESCE(v_line->>'description', p_description),
      NULLIF(v_line->>'member_id','')::uuid,
      NULLIF(v_line->>'payment_id','')::uuid
    );
  END LOOP;

  -- Auto-settle: for each unique member touched by this batch, if they have
  -- a positive prepaid credit balance AND owe on debtors, transfer the lesser
  -- of the two from member_credits to debtors so top-ups automatically clear
  -- outstanding fees. Skip when the batch itself is a member_credits<->debtors
  -- settlement to avoid ping-pong recursion.
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

        -- Mark any unpaid fee_payment rows for this member as paid where the
        -- settlement covers them (oldest first).
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

-- 2) Backfill: apply the same settlement once for every existing member with
-- both a positive prepaid credit balance and an outstanding debtors balance.
DO $$
DECLARE
  r record;
  v_settle numeric;
  v_ref uuid;
BEGIN
  FOR r IN
    SELECT club_id, club_member_id,
           SUM(CASE WHEN account='debtors' THEN debit - credit ELSE 0 END) AS debtors_bal,
           SUM(CASE WHEN account='member_credits' THEN credit - debit ELSE 0 END) AS credit_bal
    FROM public.club_journal_entries
    WHERE club_member_id IS NOT NULL
    GROUP BY club_id, club_member_id
    HAVING SUM(CASE WHEN account='debtors' THEN debit - credit ELSE 0 END) > 0
       AND SUM(CASE WHEN account='member_credits' THEN credit - debit ELSE 0 END) > 0
  LOOP
    v_settle := LEAST(r.debtors_bal, r.credit_bal);
    v_ref := gen_random_uuid();
    INSERT INTO public.club_journal_entries(
      club_id, journal_ref, account, debit, credit, description, club_member_id
    ) VALUES
      (r.club_id, v_ref, 'member_credits', v_settle, 0,
       'Auto-settled from prepaid credit (backfill)', r.club_member_id),
      (r.club_id, v_ref, 'debtors', 0, v_settle,
       'Auto-settled from prepaid credit (backfill)', r.club_member_id);

    UPDATE public.club_member_fee_payments
    SET paid = true, paid_at = COALESCE(paid_at, now())
    WHERE club_member_id = r.club_member_id
      AND COALESCE(paid, false) = false
      AND amount <= v_settle;
  END LOOP;
END $$;
