-- Forward-only follow-up to 0396 (mobile_member_finance_payload).
--
-- The payerFees display array now matches web MyAccount.tsx's payerFees query,
-- which has no paid filter: family fees this member is recorded as paying for
-- another member of this club are listed whether paid or unpaid, with method
-- 'Recorded by club' for paid rows and 'Not paid yet' otherwise.
-- Family sums, outstanding, unpaid totals, booking eligibility and the
-- synthetic family-fee statement rows stay restricted to unpaid fees (and
-- amount > 0 where 0396 applied that rule). Signature, SECURITY DEFINER,
-- search_path, internal-secret check, club scoping, grants and response keys
-- are unchanged. No tables or new APIs.

CREATE OR REPLACE FUNCTION public.mobile_member_finance_payload(
  p_sync_secret text,
  p_club_id uuid,
  p_member_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_member public.club_members%ROWTYPE;
  v_club public.clubs%ROWTYPE;
  v_current_owing numeric := 0;
  v_debtors_billed numeric := 0;
  v_debtors_paid numeric := 0;
  v_member_credits numeric := 0;
  v_unpaid_fees_total numeric := 0;
  v_unpaid_membership_total numeric := 0;
  v_family_payer_fees_total numeric := 0;
  v_plan_allowed_debt numeric := 0;
  v_required_buffer numeric := 20;
  v_shortfall numeric := 0;
  v_has_monthly_mandate boolean := false;
  v_methods text[] := ARRAY[]::text[];
  v_gateway_methods text[] := ARRAY[]::text[];
  v_fees jsonb := '[]'::jsonb;
  v_payer_fees jsonb := '[]'::jsonb;
  v_statement jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.mobile_internal_secret_ok(p_sync_secret) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_member
  FROM public.club_members
  WHERE id = p_member_id
    AND club_id = p_club_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found for club';
  END IF;

  SELECT * INTO v_club
  FROM public.clubs
  WHERE id = p_club_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Club not found';
  END IF;

  -- The web account removes GL entries for this member's own fees whose
  -- recorded payer is a different member, then adds the unpaid family fees
  -- this member pays for (amount > 0) once.
  SELECT COALESCE(SUM(f.amount), 0)
  INTO v_family_payer_fees_total
  FROM public.club_member_fee_payments f
  JOIN public.club_members other_member
    ON other_member.id = f.club_member_id
   AND other_member.club_id = p_club_id
  WHERE f.paid_by_member_id = p_member_id
    AND f.club_member_id <> p_member_id
    AND f.paid IS FALSE
    AND COALESCE(f.amount, 0) > 0;

  SELECT
    COALESCE(SUM(CASE WHEN j.account = 'debtors' THEN j.debit ELSE 0 END), 0) + v_family_payer_fees_total,
    COALESCE(SUM(CASE WHEN j.account = 'debtors' THEN j.credit ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN j.account = 'member_credits' THEN j.credit - j.debit ELSE 0 END), 0),
    COALESCE(SUM(j.debit - j.credit), 0) + v_family_payer_fees_total
  INTO v_debtors_billed, v_debtors_paid, v_member_credits, v_current_owing
  FROM public.club_journal_entries j
  WHERE j.club_member_id = p_member_id
    AND j.club_id = p_club_id
    AND j.account IN ('debtors', 'member_credits')
    AND NOT EXISTS (
      SELECT 1
      FROM public.club_member_fee_payments billed_fee
      WHERE billed_fee.id = j.fee_payment_id
        AND billed_fee.club_member_id = p_member_id
        AND billed_fee.paid_by_member_id IS NOT NULL
        AND billed_fee.paid_by_member_id <> p_member_id
        AND COALESCE(billed_fee.fee_type, '') NOT IN ('club_payable_assoc', 'club_payable_national')
    );

  SELECT
    COALESCE((
      SELECT SUM(f.amount)
      FROM public.club_member_fee_payments f
      WHERE f.club_member_id = p_member_id
        AND f.paid IS FALSE
        AND (f.paid_by_member_id IS NULL OR f.paid_by_member_id = p_member_id)
        AND COALESCE(f.fee_type, '') NOT IN ('club_payable_assoc', 'club_payable_national')
    ), 0)
    + COALESCE((
      SELECT SUM(f.amount)
      FROM public.club_member_fee_payments f
      JOIN public.club_members other_member
        ON other_member.id = f.club_member_id
       AND other_member.club_id = p_club_id
      WHERE f.paid_by_member_id = p_member_id
        AND f.club_member_id <> p_member_id
        AND f.paid IS FALSE
    ), 0)
  INTO v_unpaid_fees_total;

  SELECT
    COALESCE((
      SELECT SUM(f.amount)
      FROM public.club_member_fee_payments f
      WHERE f.club_member_id = p_member_id
        AND f.paid IS FALSE
        AND (f.paid_by_member_id IS NULL OR f.paid_by_member_id = p_member_id)
        AND f.fee_type IN ('membership', 'club_membership')
    ), 0)
    + COALESCE((
      SELECT SUM(f.amount)
      FROM public.club_member_fee_payments f
      JOIN public.club_members other_member
        ON other_member.id = f.club_member_id
       AND other_member.club_id = p_club_id
      WHERE f.paid_by_member_id = p_member_id
        AND f.club_member_id <> p_member_id
        AND f.paid IS FALSE
        AND f.fee_type IN ('membership', 'club_membership')
    ), 0)
  INTO v_unpaid_membership_total;

  SELECT EXISTS (
    SELECT 1
    FROM public.stitch_mandates sm
    WHERE sm.club_member_id = p_member_id
      AND sm.status = 'active'
      AND sm.frequency = 'monthly'
      AND sm.suspended_at IS NULL
  ) INTO v_has_monthly_mandate;

  v_plan_allowed_debt := CASE
    WHEN v_has_monthly_mandate THEN v_unpaid_fees_total
    ELSE v_unpaid_membership_total
  END;

  -- Match the current web booking gate: existing owing is grandfathered and
  -- the required top-up is the booking buffer on top of that position.
  IF v_current_owing > v_plan_allowed_debt THEN
    v_plan_allowed_debt := v_current_owing;
  END IF;

  v_required_buffer := COALESCE(v_club.min_booking_balance, 20);
  v_shortfall := GREATEST(v_current_owing - v_plan_allowed_debt + v_required_buffer, 0);

  v_methods := COALESCE(v_club.accepted_payment_methods, ARRAY[]::text[]);
  v_gateway_methods := ARRAY(
    SELECT DISTINCT lower(trim(g))
    FROM unnest(ARRAY[
      v_club.payment_gateway
    ] || COALESCE(v_club.payment_gateways, ARRAY[]::text[])) AS g
    WHERE NULLIF(lower(trim(g)), '') IS NOT NULL
  );

  IF cardinality(v_methods) = 0 THEN
    v_methods := ARRAY['eft']::text[];
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', f.id,
    'label', f.fee_label,
    'type', f.fee_type,
    'amount', COALESCE(f.amount, 0),
    'paid', COALESCE(f.paid, false),
    'paidAt', f.paid_at,
    'dueDate', f.invoice_due_date,
    'invoiceNumber', f.invoice_number,
    'method', CASE WHEN f.paid THEN 'Recorded by club' ELSE 'Not paid yet' END,
    'seasonYear', f.season_year
  ) ORDER BY COALESCE(f.season_year, 0) DESC, f.updated_at DESC NULLS LAST, f.created_at DESC NULLS LAST), '[]'::jsonb)
  INTO v_fees
  FROM public.club_member_fee_payments f
  WHERE f.club_member_id = p_member_id
    AND (f.paid_by_member_id IS NULL OR f.paid_by_member_id = p_member_id)
    AND COALESCE(f.fee_type, '') NOT IN ('club_payable_assoc', 'club_payable_national');

  -- Include paid and unpaid fees that this member is explicitly recorded as
  -- paying for another member, matching the web MyAccount payerFees query
  -- (which has no paid filter). Display only: sums and statement stay unpaid.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', f.id,
    'label', f.fee_label,
    'type', f.fee_type,
    'amount', COALESCE(f.amount, 0),
    'paid', COALESCE(f.paid, false),
    'paidAt', f.paid_at,
    'dueDate', f.invoice_due_date,
    'invoiceNumber', f.invoice_number,
    'method', CASE WHEN f.paid THEN 'Recorded by club' ELSE 'Not paid yet' END,
    'seasonYear', f.season_year,
    'billedFor', COALESCE(NULLIF(trim(other_member.name), ''), 'Family member'),
    'createdAt', f.created_at
  ) ORDER BY COALESCE(f.season_year, 0) DESC, f.updated_at DESC NULLS LAST, f.created_at DESC NULLS LAST), '[]'::jsonb)
  INTO v_payer_fees
  FROM public.club_member_fee_payments f
  JOIN public.club_members other_member
    ON other_member.id = f.club_member_id
   AND other_member.club_id = p_club_id
  WHERE f.paid_by_member_id = p_member_id
    AND f.club_member_id <> p_member_id;

  -- One chronological statement: GL control-account rows plus one synthetic
  -- debit per unpaid family fee this member pays for, as in MyAccount.tsx.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', x.id,
    'date', x.created_at,
    'description', x.description,
    'account', x.account,
    'debit', x.debit,
    'credit', x.credit,
    'balance', x.balance
  ) ORDER BY x.created_at DESC, x.src DESC, x.sort_id DESC), '[]'::jsonb)
  INTO v_statement
  FROM (
    SELECT
      u.*,
      SUM(u.debit - u.credit) OVER (ORDER BY u.created_at ASC, u.src ASC, u.sort_id ASC) AS balance
    FROM (
      SELECT
        to_jsonb(j.id) AS id,
        0 AS src,
        j.id::text AS sort_id,
        j.created_at,
        COALESCE(j.description, 'Account transaction') AS description,
        j.account::text AS account,
        ABS(COALESCE(j.debit, 0)) AS debit,
        ABS(COALESCE(j.credit, 0)) AS credit
      FROM public.club_journal_entries j
      WHERE j.club_member_id = p_member_id
        AND j.club_id = p_club_id
        AND j.account IN ('debtors', 'member_credits')
        AND NOT EXISTS (
          SELECT 1
          FROM public.club_member_fee_payments billed_fee
          WHERE billed_fee.id = j.fee_payment_id
            AND billed_fee.club_member_id = p_member_id
            AND billed_fee.paid_by_member_id IS NOT NULL
            AND billed_fee.paid_by_member_id <> p_member_id
            AND COALESCE(billed_fee.fee_type, '') NOT IN ('club_payable_assoc', 'club_payable_national')
        )
      UNION ALL
      SELECT
        to_jsonb('family-fee-' || f.id::text) AS id,
        1 AS src,
        f.id::text AS sort_id,
        f.created_at,
        'Fee raised: ' || COALESCE(NULLIF(trim(other_member.name), ''), 'Family member')
          || ' — ' || COALESCE(f.fee_label, '') AS description,
        'debtors' AS account,
        COALESCE(f.amount, 0) AS debit,
        0::numeric AS credit
      FROM public.club_member_fee_payments f
      JOIN public.club_members other_member
        ON other_member.id = f.club_member_id
       AND other_member.club_id = p_club_id
      WHERE f.paid_by_member_id = p_member_id
        AND f.club_member_id <> p_member_id
        AND f.paid IS FALSE
        AND COALESCE(f.amount, 0) > 0
    ) u
  ) x;

  RETURN jsonb_build_object(
    'clubId', p_club_id,
    'memberId', p_member_id,
    'minimumPlayBalance', v_required_buffer,
    'currencyCode', COALESCE(v_club.currency_code, 'ZAR'),
    'currencySymbol', COALESCE(v_club.currency_symbol, CASE WHEN COALESCE(v_club.currency_code, 'ZAR') = 'ZAR' THEN 'R' ELSE COALESCE(v_club.currency_code, 'ZAR') END),
    'paymentMethods', v_methods,
    'paymentSetup', jsonb_build_object(
      'methods', v_methods,
      'onlineGateways', v_gateway_methods,
      'canPayOnline', ('online' = ANY(v_methods) AND cardinality(v_gateway_methods) > 0),
      'canPayEft', ('eft' = ANY(v_methods)),
      'cashAccepted', ('cash' = ANY(v_methods)),
      'webPaymentUrl', CASE
        WHEN NULLIF(trim(v_club.subdomain), '') IS NOT NULL THEN 'https://' || lower(trim(v_club.subdomain)) || '.squashhub.co.za/my-account?pay=1'
        ELSE 'https://squashhub.co.za/my-account?pay=1'
      END,
      'eftBankDetails', (
        SELECT CASE
          WHEN s.bank_account_number IS NULL THEN NULL
          ELSE jsonb_build_object(
            'bankName', s.bank_name,
            'accountName', s.bank_account_name,
            'accountNumber', s.bank_account_number,
            'branchCode', s.bank_branch_code,
            'reference', s.bank_reference
          )
        END
        FROM public.club_secrets s
        WHERE s.club_id = p_club_id
        LIMIT 1
      )
    ),
    'totalBilled', ROUND(v_debtors_billed::numeric, 2),
    'totalPaid', ROUND(v_debtors_paid::numeric, 2),
    'outstanding', ROUND(GREATEST(v_current_owing, 0)::numeric, 2),
    'playableBalance', ROUND(GREATEST(-v_current_owing, 0)::numeric, 2),
    'memberCreditBalance', ROUND(v_member_credits::numeric, 2),
    'unpaidFeesTotal', ROUND(v_unpaid_fees_total::numeric, 2),
    'bookingShortfall', ROUND(v_shortfall::numeric, 2),
    'planAllowedDebt', ROUND(v_plan_allowed_debt::numeric, 2),
    'hasMonthlyMandate', v_has_monthly_mandate,
    'canPlay', v_shortfall <= 0,
    'status', CASE
      WHEN v_shortfall > 0 THEN 'top_up_required'
      WHEN v_current_owing > 0 THEN 'outstanding'
      ELSE 'clear'
    END,
    'fees', v_fees,
    'payerFees', v_payer_fees,
    'statement', v_statement
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mobile_member_finance_payload(text, uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.mobile_member_finance_payload(text, uuid, uuid) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
