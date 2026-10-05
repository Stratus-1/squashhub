-- Outstanding balance = the member's whole account debt (bar, shop, court lights,
-- bookings, tournaments, opening balance, any charge), minus what an active
-- membership fee plan already covers and what other outstanding plans still finance.
CREATE OR REPLACE FUNCTION public.member_outstanding_breakdown(p_club_member_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_club uuid; v_has_fee_plan boolean; v_owing numeric := 0; v_fee_plan numeric := 0;
  v_in_plans numeric := 0; v_buffer numeric := 0; v_uncovered numeric := 0; v_ids uuid[];
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

  -- Whole account balance owed (every charge type, net of credits/payments).
  SELECT COALESCE(sum(COALESCE(debit,0) - COALESCE(credit,0)),0) INTO v_owing
    FROM club_journal_entries WHERE club_member_id = p_club_member_id AND account IN ('debtors','member_credits');

  IF v_has_fee_plan THEN
    SELECT COALESCE(sum(amount),0) INTO v_fee_plan FROM club_member_fee_payments
     WHERE club_member_id = p_club_member_id AND paid = false AND amount > 0 AND is_membership_fee_type(fee_type);
  END IF;

  SELECT COALESCE(sum(greatest(0, total_amount - amount_collected)),0) INTO v_in_plans
    FROM mandate_arrears_plans WHERE club_member_id = p_club_member_id AND status = 'active';

  -- Itemised charges the plan settles (non-itemised debt such as court lights is cleared via account credit).
  SELECT array_agg(f.id ORDER BY f.created_at) INTO v_ids FROM club_member_fee_payments f
   WHERE f.club_member_id = p_club_member_id AND f.paid = false AND f.amount > 0
     AND NOT (v_has_fee_plan AND is_membership_fee_type(f.fee_type))
     AND NOT EXISTS (SELECT 1 FROM mandate_arrears_plans ap WHERE ap.club_member_id = p_club_member_id
                     AND ap.status = 'active' AND f.id = ANY(ap.covered_fee_ids));

  SELECT COALESCE(min_booking_balance,0) INTO v_buffer FROM clubs WHERE id = v_club;
  v_uncovered := greatest(0, round(v_owing - v_fee_plan - v_in_plans, 2));

  RETURN jsonb_build_object(
    'account_owing', v_owing, 'has_fee_plan', v_has_fee_plan, 'fee_plan_covered', v_fee_plan,
    'in_outstanding_plans', v_in_plans, 'required_buffer', v_buffer, 'credit_applied', 0,
    'uncovered', v_uncovered, 'eligible_fee_ids', COALESCE(to_jsonb(v_ids), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.member_outstanding_breakdown(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.member_outstanding_breakdown(uuid) TO authenticated;