
-- Fix duplicate "Fee raised" journal entries created by admin_bill_member_fee.
-- The RPC was inserting the fee row (which the AFTER INSERT trigger journals)
-- AND then posting a second "Fee raised" journal pair itself. Result: two
-- debtors debits per bill. This rewrites the RPC to rely on the trigger only,
-- and back-dates the trigger's rows when the admin specified a custom date.

CREATE OR REPLACE FUNCTION public.admin_bill_member_fee(
  _club_member_id uuid,
  _amount numeric,
  _fee_label text,
  _income_account text,
  _fee_type text DEFAULT 'club',
  _date timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _club_id uuid;
  _fee_id uuid;
  _ref uuid;
BEGIN
  SELECT club_id INTO _club_id FROM public.club_members WHERE id = _club_member_id;
  IF _club_id IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF NOT public.is_club_admin(auth.uid(), _club_id) THEN RAISE EXCEPTION 'Not authorised'; END IF;
  IF _amount IS NULL OR _amount <= 0 THEN RAISE EXCEPTION 'Amount must be > 0'; END IF;
  IF _income_account NOT IN ('membership_income','league_fees_income','national_body_income','tournament_income','light_fees_income','fee_income','bar_income') THEN
    RAISE EXCEPTION 'Invalid income account: %', _income_account;
  END IF;

  -- Insert fee row. The AFTER INSERT trigger (journal_fee_assessment) posts
  -- the Dr Debtors / Cr <income> pair automatically.
  BEGIN
    INSERT INTO public.club_member_fee_payments(
      club_member_id, fee_type, fee_label, amount, paid, season_year
    ) VALUES (
      _club_member_id, _fee_type, _fee_label, _amount, false,
      EXTRACT(year FROM _date)::int
    )
    RETURNING id INTO _fee_id;
  EXCEPTION WHEN unique_violation THEN
    SELECT id INTO _fee_id FROM public.club_member_fee_payments
    WHERE club_member_id = _club_member_id
      AND fee_type = _fee_type
      AND fee_label = _fee_label
      AND season_year = EXTRACT(year FROM _date)::int;
  END;

  -- Grab the journal_ref the trigger just posted for this fee (if any).
  SELECT j.journal_ref INTO _ref
  FROM public.club_journal_entries j
  WHERE j.fee_payment_id = _fee_id
    AND j.description = 'Fee raised: ' || _fee_label
  ORDER BY j.created_at DESC
  LIMIT 1;

  -- If the admin picked a custom date, back-date the trigger's rows to it.
  IF _ref IS NOT NULL AND _date IS NOT NULL AND abs(EXTRACT(EPOCH FROM (_date - now()))) > 60 THEN
    UPDATE public.club_journal_entries
       SET created_at = _date
     WHERE journal_ref = _ref;
  END IF;

  IF _ref IS NOT NULL THEN
    INSERT INTO public.ledger_audit_log(club_id, journal_ref, action, actor_user_id, after_json, note)
    VALUES (_club_id, _ref, 'create', auth.uid(),
      jsonb_build_object('member_id', _club_member_id, 'amount', _amount, 'label', _fee_label, 'income', _income_account),
      'Manual bill via admin UI');
  END IF;

  RETURN jsonb_build_object('ok', true, 'journal_ref', _ref, 'fee_payment_id', _fee_id);
END;
$$;

-- Clean up the one existing duplicate: keep the 01 Jun 26 pair (admin's chosen
-- date), remove the auto-trigger pair created moments later.
DELETE FROM public.club_journal_entries
 WHERE journal_ref = '1c27d2b9-18af-464e-97ea-dd453d4528ed'::uuid
   AND fee_payment_id = '8b1be1cd-7943-4c02-87cc-d67e32ebb39a'::uuid;
