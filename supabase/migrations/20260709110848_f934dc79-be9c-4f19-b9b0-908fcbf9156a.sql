
-- 1. post_journal RPC
CREATE OR REPLACE FUNCTION public.post_journal(
  p_club_id uuid,
  p_lines jsonb,
  p_ref uuid DEFAULT gen_random_uuid(),
  p_description text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_line jsonb;
  v_total_dr numeric := 0;
  v_total_cr numeric := 0;
BEGIN
  IF p_club_id IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) < 2 THEN
    RAISE EXCEPTION 'post_journal: need club_id and >=2 lines';
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_total_dr := v_total_dr + COALESCE((v_line->>'debit')::numeric, 0);
    v_total_cr := v_total_cr + COALESCE((v_line->>'credit')::numeric, 0);
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

  RETURN p_ref;
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_journal(uuid, jsonb, uuid, text) TO authenticated, service_role;

-- 2. Normalize legacy account codes
UPDATE public.club_journal_entries SET account = 'membership_income' WHERE account = 'fee_income';
UPDATE public.club_journal_entries SET account = 'bank_current'      WHERE account = 'bank';

-- 3. Retro-fix missing "fee raised" legs (paired refs per payment)
WITH paid_no_raised AS (
  SELECT
    p.id AS payment_id, p.club_member_id, cm.club_id, p.amount,
    p.fee_type, p.is_pass_through,
    COALESCE(p.paid_at, p.created_at) AS ts, p.fee_label
  FROM public.club_member_fee_payments p
  JOIN public.club_members cm ON cm.id = p.club_member_id
  WHERE p.paid = true AND p.amount > 0
    AND NOT EXISTS (
      SELECT 1 FROM public.club_journal_entries j
      WHERE j.fee_payment_id = p.id AND j.account = 'debtors' AND j.debit > 0
    )
    AND EXISTS (
      SELECT 1 FROM public.club_journal_entries j
      WHERE j.fee_payment_id = p.id
        AND j.account IN ('bank_current','cash') AND j.debit > 0
    )
),
mapped AS (
  SELECT *, gen_random_uuid() AS ref,
    CASE
      WHEN is_pass_through THEN 'association_payable'::gl_account
      WHEN fee_type IN ('tournament','tournament_entry') THEN 'tournament_income'::gl_account
      WHEN fee_type = 'league_affiliation' THEN 'league_fees_income'::gl_account
      ELSE 'membership_income'::gl_account
    END AS credit_account
  FROM paid_no_raised
)
INSERT INTO public.club_journal_entries(
  club_id, journal_ref, account, debit, credit, description, club_member_id, fee_payment_id, created_at
)
SELECT club_id, ref, 'debtors'::gl_account, amount, 0,
       'Retro: fee raised (' || COALESCE(fee_label,'') || ')', club_member_id, payment_id, ts
FROM mapped
UNION ALL
SELECT club_id, ref, credit_account, 0, amount,
       'Retro: fee income (' || COALESCE(fee_label,'') || ')', club_member_id, payment_id, ts
FROM mapped;

-- 4. Ledger integrity RPC
CREATE OR REPLACE FUNCTION public.check_ledger_integrity(p_club_id uuid DEFAULT NULL)
RETURNS TABLE(
  club_id uuid, club_name text,
  total_debit numeric, total_credit numeric, imbalance numeric,
  debtors_balance numeric, debtors_is_credit boolean,
  bank_balance numeric, total_income numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    c.id, c.name,
    COALESCE(SUM(j.debit),0),
    COALESCE(SUM(j.credit),0),
    ROUND(COALESCE(SUM(j.debit),0) - COALESCE(SUM(j.credit),0), 2),
    ROUND(COALESCE(SUM(j.debit) FILTER (WHERE j.account='debtors'),0)
        - COALESCE(SUM(j.credit) FILTER (WHERE j.account='debtors'),0), 2),
    (COALESCE(SUM(j.credit) FILTER (WHERE j.account='debtors'),0)
     > COALESCE(SUM(j.debit) FILTER (WHERE j.account='debtors'),0)),
    ROUND(COALESCE(SUM(j.debit) FILTER (WHERE j.account IN ('bank_current','cash')),0)
        - COALESCE(SUM(j.credit) FILTER (WHERE j.account IN ('bank_current','cash')),0), 2),
    ROUND(COALESCE(SUM(j.credit) FILTER (WHERE j.account IN (
        'membership_income','league_fees_income','national_body_income',
        'tournament_income','light_fees_income','bar_income')),0)
        - COALESCE(SUM(j.debit) FILTER (WHERE j.account IN (
        'membership_income','league_fees_income','national_body_income',
        'tournament_income','light_fees_income','bar_income')),0), 2)
  FROM public.clubs c
  LEFT JOIN public.club_journal_entries j ON j.club_id = c.id
  WHERE p_club_id IS NULL OR c.id = p_club_id
  GROUP BY c.id, c.name
  ORDER BY c.name;
$$;

GRANT EXECUTE ON FUNCTION public.check_ledger_integrity(uuid) TO authenticated, service_role;
