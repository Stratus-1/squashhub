-- Outstanding-balance component on the same recurring debit: combined amount charged, components tracked separately.
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

  -- Debit orders are bank-capped per mandate: the higher combined amount needs re-approval.
  IF COALESCE(m.gateway,'stitch') <> 'payfast' THEN
    RETURN jsonb_build_object('status','needs_reauth','monthly_instalment',v_extra,'outstanding',v_out,'fee_plan_monthly',m.max_amount_cents/100.0,'new_total',m.max_amount_cents/100.0 + v_extra);
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
                            'fee_plan_monthly', m.max_amount_cents / 100.0, 'new_total', m.max_amount_cents / 100.0 + v_extra);
END $$;
REVOKE ALL ON FUNCTION public.start_arrears_plan(uuid,int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.start_arrears_plan(uuid,int) TO authenticated;