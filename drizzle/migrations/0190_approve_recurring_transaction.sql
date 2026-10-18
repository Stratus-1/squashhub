ALTER TABLE public.club_recurring_transactions ADD COLUMN IF NOT EXISTS custom_account_id uuid, ADD COLUMN IF NOT EXISTS gateway_fee_rate numeric(6,4) NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.recurring_next_due(_d date, _f text) RETURNS date
LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT (CASE _f WHEN 'weekly' THEN _d + 7
    WHEN 'monthly' THEN (_d + interval '1 month')::date
    WHEN 'quarterly' THEN (_d + interval '3 months')::date
    ELSE (_d + interval '1 year')::date END)
$$;

CREATE OR REPLACE FUNCTION public.decide_recurring_transaction(_id uuid, _expected_due date, _approve boolean, _amount numeric DEFAULT NULL, _date date DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.club_recurring_transactions; v_amt numeric; v_ref uuid := NULL; v_money text; v_fee numeric; v_fref uuid; v_when timestamptz;
BEGIN
  SELECT * INTO r FROM public.club_recurring_transactions WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR NOT r.active THEN RAISE EXCEPTION 'Recurring transaction not found'; END IF;
  IF auth.uid() IS NULL OR NOT public.is_club_admin_or_permitted(auth.uid(), r.club_id, 'finance') THEN
    RAISE EXCEPTION 'You do not have finance permission for this club';
  END IF;
  IF r.next_due <> _expected_due THEN RAISE EXCEPTION 'This occurrence was already handled'; END IF;
  IF _approve THEN
    v_amt := round(COALESCE(_amount, r.amount), 2);
    IF v_amt <= 0 THEN RAISE EXCEPTION 'Amount must be more than zero'; END IF;
    v_money := CASE WHEN r.method = 'cash' THEN 'cash' ELSE 'bank_current' END;
    v_when := (COALESCE(_date, r.next_due)::timestamp + time '12:00') AT TIME ZONE 'Africa/Johannesburg';
    v_ref := public.post_journal(r.club_id, jsonb_build_array(
      jsonb_build_object('account', CASE WHEN r.direction='income' THEN v_money ELSE r.account END, 'debit', v_amt, 'description', r.description, 'member_id', r.member_id,
        'custom_account_id', CASE WHEN r.direction='expense' THEN r.custom_account_id END),
      jsonb_build_object('account', CASE WHEN r.direction='income' THEN r.account ELSE v_money END, 'credit', v_amt, 'description', r.description, 'member_id', r.member_id,
        'custom_account_id', CASE WHEN r.direction='income' THEN r.custom_account_id END)
    ), gen_random_uuid(), r.description);
    UPDATE public.club_journal_entries SET created_at = v_when WHERE club_id = r.club_id AND journal_ref = v_ref;
    IF r.method = 'card' AND r.gateway_fee_rate > 0 THEN
      v_fee := round(v_amt * r.gateway_fee_rate, 2);
      v_fref := public.post_journal(r.club_id, jsonb_build_array(
        jsonb_build_object('account','gateway_fees','debit',v_fee,'description','Gateway fee on card payment: '||r.description),
        jsonb_build_object('account','bank_current','credit',v_fee,'description','Gateway fee on card payment: '||r.description)), gen_random_uuid(), NULL);
      UPDATE public.club_journal_entries SET created_at = v_when WHERE club_id = r.club_id AND journal_ref = v_fref;
    END IF;
  END IF;
  UPDATE public.club_recurring_transactions SET next_due = public.recurring_next_due(r.next_due, r.frequency), updated_at = now() WHERE id = _id;
  RETURN v_ref;
END $$;
REVOKE ALL ON FUNCTION public.decide_recurring_transaction(uuid,date,boolean,numeric,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decide_recurring_transaction(uuid,date,boolean,numeric,date) TO authenticated, service_role;