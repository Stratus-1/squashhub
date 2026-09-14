-- Mobile finance payload for the player app.
--
-- This does not create a second mobile finance model. It mirrors the web
-- MyAccount and booking balance logic:
--   - club_journal_entries is the accounting truth
--   - club_member_fee_payments provides fee detail
--   - clubs provides payment methods and min booking balance

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
  v_plan_allowed_debt numeric := 0;
  v_required_buffer numeric := 20;
  v_shortfall numeric := 0;
  v_has_monthly_mandate boolean := false;
  v_methods text[] := ARRAY[]::text[];
  v_gateway_methods text[] := ARRAY[]::text[];
  v_fees jsonb := '[]'::jsonb;
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

  SELECT
    COALESCE(SUM(CASE WHEN account = 'debtors' THEN debit ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN account = 'debtors' THEN credit ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN account = 'member_credits' THEN credit - debit ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN account IN ('debtors', 'member_credits') THEN debit - credit ELSE 0 END), 0)
  INTO v_debtors_billed, v_debtors_paid, v_member_credits, v_current_owing
  FROM public.club_journal_entries
  WHERE club_member_id = p_member_id
    AND club_id = p_club_id
    AND account IN ('debtors', 'member_credits');

  SELECT COALESCE(SUM(amount), 0)
  INTO v_unpaid_fees_total
  FROM public.club_member_fee_payments
  WHERE club_member_id = p_member_id
    AND paid IS FALSE
    AND COALESCE(fee_type, '') NOT IN ('club_payable_assoc', 'club_payable_national');

  SELECT COALESCE(SUM(amount), 0)
  INTO v_unpaid_membership_total
  FROM public.club_member_fee_payments
  WHERE club_member_id = p_member_id
    AND paid IS FALSE
    AND fee_type IN ('membership', 'club_membership');

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
    AND COALESCE(f.fee_type, '') NOT IN ('club_payable_assoc', 'club_payable_national');

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', x.id,
    'date', x.created_at,
    'description', x.description,
    'account', x.account,
    'debit', x.debit,
    'credit', x.credit,
    'balance', x.balance
  ) ORDER BY x.created_at DESC), '[]'::jsonb)
  INTO v_statement
  FROM (
    SELECT
      j.id,
      j.created_at,
      COALESCE(j.description, 'Account transaction') AS description,
      j.account::text AS account,
      ABS(COALESCE(j.debit, 0)) AS debit,
      ABS(COALESCE(j.credit, 0)) AS credit,
      SUM(COALESCE(j.debit, 0) - COALESCE(j.credit, 0)) OVER (ORDER BY j.created_at ASC, j.id ASC) AS balance
    FROM public.club_journal_entries j
    WHERE j.club_member_id = p_member_id
      AND j.club_id = p_club_id
      AND j.account IN ('debtors', 'member_credits')
    ORDER BY j.created_at ASC, j.id ASC
    LIMIT 80
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
      'eftBankDetails', NULL
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
    'statement', v_statement
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mobile_member_finance_payload(text, uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.mobile_member_finance_payload(text, uuid, uuid) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
