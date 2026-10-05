-- Outstanding-balance plans are separate arrangements from fee-structure
-- recurring plans: they finance only uncovered debt and never change the fee plan.
ALTER TABLE public.mandate_arrears_plans
  ADD COLUMN IF NOT EXISTS covered_fee_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS fee_plan_excluded numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credit_applied numeric NOT NULL DEFAULT 0;
COMMENT ON COLUMN public.mandate_arrears_plans.mandate_id IS 'Payment method (token) reused for collection only; the plan is a separate arrangement and never changes that mandate amount/term.';
COMMENT ON COLUMN public.mandate_arrears_plans.monthly_extra IS 'Instalment of THIS outstanding-balance plan, charged as its own collection (not added to the fee plan).';

ALTER TABLE public.stitch_collections ADD COLUMN IF NOT EXISTS arrears_plan_id uuid REFERENCES public.mandate_arrears_plans(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_stitch_collections_arrears_due ON public.stitch_collections(arrears_plan_id, due_date) WHERE arrears_plan_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.is_membership_fee_type(p_type text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT lower(coalesce(p_type,'')) IN ('club','renewal','registration','membership','club_membership')
$$;

-- Single source of truth for what an outstanding-balance plan may finance.
CREATE OR REPLACE FUNCTION public.member_outstanding_breakdown(p_club_member_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_club uuid; v_has_fee_plan boolean; v_unpaid numeric := 0; v_fee_plan numeric := 0;
  v_in_plans numeric := 0; v_owing numeric := 0; v_buffer numeric := 0; v_free numeric := 0;
  v_candidate numeric := 0; v_uncovered numeric := 0; v_ids uuid[];
BEGIN
  SELECT club_id INTO v_club FROM club_members WHERE id = p_club_member_id;
  IF v_club IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF auth.uid() IS NOT NULL AND NOT (
       EXISTS (SELECT 1 FROM club_members WHERE id = p_club_member_id AND user_id = auth.uid())
       OR is_club_admin_or_permitted(auth.uid(), v_club, 'finance')) THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT EXISTS (SELECT 1 FROM stitch_mandates WHERE club_member_id = p_club_member_id
     AND status = 'active' AND frequency = 'monthly' AND suspended_at IS NULL) INTO v_has_fee_plan;

  SELECT COALESCE(sum(amount),0) INTO v_unpaid FROM club_member_fee_payments
   WHERE club_member_id = p_club_member_id AND paid = false AND amount > 0;
  IF v_has_fee_plan THEN
    SELECT COALESCE(sum(amount),0) INTO v_fee_plan FROM club_member_fee_payments
     WHERE club_member_id = p_club_member_id AND paid = false AND amount > 0 AND is_membership_fee_type(fee_type);
  END IF;
  SELECT COALESCE(sum(f.amount),0) INTO v_in_plans FROM club_member_fee_payments f
   WHERE f.club_member_id = p_club_member_id AND f.paid = false AND f.amount > 0
     AND EXISTS (SELECT 1 FROM mandate_arrears_plans ap WHERE ap.club_member_id = p_club_member_id
                 AND ap.status = 'active' AND f.id = ANY(ap.covered_fee_ids))
     AND NOT (v_has_fee_plan AND is_membership_fee_type(f.fee_type));

  SELECT array_agg(f.id ORDER BY f.created_at), COALESCE(sum(f.amount),0) INTO v_ids, v_candidate
    FROM club_member_fee_payments f
   WHERE f.club_member_id = p_club_member_id AND f.paid = false AND f.amount > 0
     AND NOT (v_has_fee_plan AND is_membership_fee_type(f.fee_type))
     AND NOT EXISTS (SELECT 1 FROM mandate_arrears_plans ap WHERE ap.club_member_id = p_club_member_id
                     AND ap.status = 'active' AND f.id = ANY(ap.covered_fee_ids));

  -- Floating balance rule: wallet credit above the club's required buffer offsets debt first.
  SELECT COALESCE(min_booking_balance,0) INTO v_buffer FROM clubs WHERE id = v_club;
  SELECT COALESCE(sum(COALESCE(debit,0) - COALESCE(credit,0)),0) INTO v_owing
    FROM club_journal_entries WHERE club_member_id = p_club_member_id AND account IN ('debtors','member_credits');
  v_free := greatest(0, (v_unpaid - v_owing) - v_buffer);
  v_uncovered := greatest(0, round(v_candidate - v_free, 2));

  RETURN jsonb_build_object(
    'total_unpaid', v_unpaid, 'has_fee_plan', v_has_fee_plan, 'fee_plan_covered', v_fee_plan,
    'in_outstanding_plans', v_in_plans, 'required_buffer', v_buffer, 'credit_applied', least(v_free, v_candidate),
    'uncovered', v_uncovered, 'eligible_fee_ids', COALESCE(to_jsonb(v_ids), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.member_outstanding_breakdown(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.member_outstanding_breakdown(uuid) TO authenticated;

-- Start a NEW outstanding-balance plan. Never modifies the fee-structure plan.
CREATE OR REPLACE FUNCTION public.start_arrears_plan(p_mandate_id uuid, p_months int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  m record; s record; b jsonb; v_out numeric; v_extra numeric; v_plan uuid; v_ids uuid[];
BEGIN
  SELECT sm.* INTO m FROM stitch_mandates sm JOIN club_members cm ON cm.id = sm.club_member_id
   WHERE sm.id = p_mandate_id AND cm.user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment method not found'; END IF;
  IF m.status <> 'active' THEN RAISE EXCEPTION 'Your saved payment method must be active first'; END IF;

  SELECT * INTO s FROM club_recurring_settings WHERE club_id = m.club_id;
  IF NOT FOUND OR NOT s.recurring_enabled OR NOT s.arrears_enabled THEN
    RAISE EXCEPTION 'Your club is not offering monthly payment of outstanding balances';
  END IF;
  IF (s.arrears_from IS NOT NULL AND current_date < s.arrears_from) OR (s.arrears_until IS NOT NULL AND current_date > s.arrears_until) THEN
    RAISE EXCEPTION 'This offer is not open right now';
  END IF;
  IF NOT (p_months = ANY(s.allowed_months)) OR p_months > s.arrears_max_months THEN
    RAISE EXCEPTION 'That period is not allowed by your club';
  END IF;
  IF EXISTS (SELECT 1 FROM mandate_arrears_plans WHERE club_member_id = m.club_member_id AND status = 'active') THEN
    RAISE EXCEPTION 'You already have an outstanding-balance plan';
  END IF;

  b := member_outstanding_breakdown(m.club_member_id);
  v_out := (b->>'uncovered')::numeric;
  SELECT array_agg(x::uuid) INTO v_ids FROM jsonb_array_elements_text(b->'eligible_fee_ids') x;
  IF v_out <= 0 OR v_ids IS NULL THEN RAISE EXCEPTION 'You have no outstanding balance that is not already covered'; END IF;
  IF v_out < s.arrears_min_amount THEN RAISE EXCEPTION 'Your uncovered balance is below the club minimum for this offer'; END IF;

  v_extra := ceil(v_out / p_months * 100) / 100;

  -- Debit orders are bank-capped per mandate: a separate plan needs its own approval.
  IF COALESCE(m.gateway,'stitch') <> 'payfast' THEN
    RETURN jsonb_build_object('status','needs_reauth','monthly_instalment',v_extra,'outstanding',v_out);
  END IF;

  INSERT INTO mandate_arrears_plans(club_id, mandate_id, club_member_id, total_amount, monthly_extra, months_total, ends_on,
                                    created_by, covered_fee_ids, fee_plan_excluded, credit_applied)
  VALUES (m.club_id, m.id, m.club_member_id, v_out, v_extra, p_months, (current_date + make_interval(months => p_months))::date,
          auth.uid(), v_ids, (b->>'fee_plan_covered')::numeric, (b->>'credit_applied')::numeric)
  RETURNING id INTO v_plan;

  INSERT INTO recurring_payment_audit(club_id, actor_id, action, details)
  VALUES (m.club_id, auth.uid(), 'arrears_plan_started',
    jsonb_build_object('plan_id', v_plan, 'payment_method_mandate_id', m.id, 'club_member_id', m.club_member_id,
      'total', v_out, 'months', p_months, 'monthly_instalment', v_extra, 'covered_fee_ids', v_ids,
      'fee_plan_excluded', b->'fee_plan_covered', 'credit_applied', b->'credit_applied',
      'fee_plan_amount_unchanged_cents', m.max_amount_cents));

  RETURN jsonb_build_object('status','active','plan_id',v_plan,'monthly_instalment',v_extra,'outstanding',v_out,
                            'fee_plan_monthly', m.max_amount_cents / 100.0);
END $$;
REVOKE ALL ON FUNCTION public.start_arrears_plan(uuid,int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.start_arrears_plan(uuid,int) TO authenticated;