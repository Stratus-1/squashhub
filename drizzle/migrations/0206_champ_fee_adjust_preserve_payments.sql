CREATE OR REPLACE FUNCTION public._champ_fee_adjust(p_fee_id uuid, p_new_amount numeric, p_note text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE f record; v_club uuid; v_diff numeric; v_ref uuid; v_assessed numeric; v_applied numeric; v_outstanding numeric;
BEGIN
  SELECT * INTO f FROM public.club_member_fee_payments WHERE id = p_fee_id FOR UPDATE;
  IF NOT FOUND OR f.paid OR f.invoice_issued_at IS NOT NULL THEN RETURN p_fee_id; END IF;
  SELECT club_id INTO v_club FROM public.club_members WHERE id = f.club_member_id;
  -- The row amount is remaining debt after partial payments, not the original assessment.
  SELECT coalesce(sum(credit - debit), f.amount, 0) INTO v_assessed
  FROM public.club_journal_entries
  WHERE fee_payment_id = f.id AND club_id = v_club AND account = 'tournament_income';
  v_applied := greatest(v_assessed - coalesce(f.amount, 0), 0);
  v_diff := round(coalesce(p_new_amount, 0), 2) - v_assessed;
  IF v_diff = 0 THEN RETURN p_fee_id; END IF;
  v_outstanding := greatest(round(coalesce(p_new_amount, 0), 2) - v_applied, 0);
  v_ref := gen_random_uuid();
  IF v_club IS NOT NULL THEN
    INSERT INTO public.club_journal_entries (club_id, club_member_id, fee_payment_id, account, debit, credit, description, journal_ref)
    VALUES (v_club, f.club_member_id, CASE WHEN p_new_amount > 0 THEN f.id END, 'debtors', greatest(v_diff,0), greatest(-v_diff,0), 'Entry fee adjusted: ' || coalesce(f.fee_label,''), v_ref),
           (v_club, f.club_member_id, CASE WHEN p_new_amount > 0 THEN f.id END, 'tournament_income', greatest(-v_diff,0), greatest(v_diff,0), 'Entry fee adjusted: ' || coalesce(f.fee_label,''), v_ref);
    INSERT INTO public.ledger_audit_log (club_id, journal_ref, action, actor_user_id, after_json, note)
    VALUES (v_club, v_ref, 'edit', auth.uid(),
      jsonb_build_object('fee_payment_id', f.id, 'from', v_assessed, 'to', p_new_amount, 'payment_applied', v_applied, 'outstanding', v_outstanding), p_note);
  END IF;
  IF coalesce(p_new_amount, 0) <= 0 THEN
    UPDATE public.club_champs_registrations SET fee_payment_id = NULL WHERE fee_payment_id = f.id;
    DELETE FROM public.club_member_fee_payments WHERE id = f.id AND paid = false;
    RETURN NULL;
  END IF;
  UPDATE public.club_member_fee_payments SET amount = v_outstanding WHERE id = f.id;
  RETURN f.id;
END $$;