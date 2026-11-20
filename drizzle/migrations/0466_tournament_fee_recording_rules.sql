CREATE OR REPLACE FUNCTION public._champ_fee_adjust(p_fee_id uuid, p_new_amount numeric, p_note text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE f record; v_club uuid; v_diff numeric; v_ref uuid; v_assessed numeric; v_applied numeric; v_outstanding numeric;
        v_raise_ref uuid; v_raise_at timestamptz; v_before jsonb; v_new numeric;
BEGIN
  SELECT * INTO f FROM public.club_member_fee_payments WHERE id = p_fee_id FOR UPDATE;
  IF NOT FOUND OR f.paid OR f.invoice_issued_at IS NOT NULL THEN RETURN p_fee_id; END IF;
  SELECT club_id INTO v_club FROM public.club_members WHERE id = f.club_member_id;
  SELECT coalesce(sum(credit - debit), f.amount, 0) INTO v_assessed
  FROM public.club_journal_entries
  WHERE fee_payment_id = f.id AND club_id = v_club AND account = 'tournament_income';
  v_applied := greatest(v_assessed - coalesce(f.amount, 0), 0);
  v_new := round(coalesce(p_new_amount, 0), 2);
  v_diff := v_new - v_assessed;
  IF v_diff = 0 THEN RETURN p_fee_id; END IF;
  v_outstanding := greatest(v_new - v_applied, 0);

  -- Simple case: one untouched "Fee raised" pair, nothing paid, raised this month -> amend it.
  IF v_club IS NOT NULL AND v_new > 0 AND v_applied = 0 THEN
    SELECT j.journal_ref, min(j.created_at) INTO v_raise_ref, v_raise_at
      FROM public.club_journal_entries j
     WHERE j.fee_payment_id = f.id AND j.club_id = v_club
     GROUP BY j.journal_ref
    HAVING count(*) = 2
       AND bool_and(j.description LIKE 'Fee raised:%')
       AND count(*) FILTER (WHERE j.account = 'debtors' AND j.credit = 0) = 1
       AND count(*) FILTER (WHERE j.account = 'tournament_income' AND j.debit = 0) = 1;
    IF v_raise_ref IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.club_journal_entries j
                        WHERE j.fee_payment_id = f.id AND j.journal_ref IS DISTINCT FROM v_raise_ref)
       AND date_trunc('month', v_raise_at AT TIME ZONE 'Africa/Johannesburg')
           = date_trunc('month', now() AT TIME ZONE 'Africa/Johannesburg') THEN
      SELECT jsonb_agg(to_jsonb(j)) INTO v_before FROM public.club_journal_entries j WHERE j.journal_ref = v_raise_ref;
      UPDATE public.club_journal_entries
         SET debit = CASE WHEN account = 'debtors' THEN v_new ELSE 0 END,
             credit = CASE WHEN account = 'tournament_income' THEN v_new ELSE 0 END,
             description = 'Fee raised: ' || coalesce(f.fee_label, '')
       WHERE journal_ref = v_raise_ref AND fee_payment_id = f.id;
      INSERT INTO public.ledger_audit_log (club_id, journal_ref, action, actor_user_id, before_json, after_json, note)
      VALUES (v_club, v_raise_ref, 'edit', auth.uid(), jsonb_build_object('lines', v_before),
        jsonb_build_object('fee_payment_id', f.id, 'from', v_assessed, 'to', v_new, 'amended_in_place', true), p_note);
      UPDATE public.club_member_fee_payments SET amount = v_new WHERE id = f.id;
      RETURN f.id;
    END IF;
  END IF;

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
END $function$;

CREATE OR REPLACE FUNCTION public.tg_tournament_fee_label_sync()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.club_journal_entries
     SET description = 'Fee raised: ' || NEW.fee_label
   WHERE fee_payment_id = NEW.id
     AND description = 'Fee raised: ' || OLD.fee_label;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_tournament_fee_label_sync ON public.club_member_fee_payments;
CREATE TRIGGER trg_tournament_fee_label_sync
AFTER UPDATE OF fee_label ON public.club_member_fee_payments
FOR EACH ROW
WHEN (NEW.fee_type = 'tournament_entry' AND NOT coalesce(NEW.paid, false)
      AND OLD.fee_label IS DISTINCT FROM NEW.fee_label AND NEW.fee_label IS NOT NULL)
EXECUTE FUNCTION public.tg_tournament_fee_label_sync();

CREATE OR REPLACE FUNCTION public.champ_admin_confirm_paid(p_club_id uuid, p_champ_id uuid, p_registration_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_reg public.club_champs_registrations%ROWTYPE;
  v_fee_member uuid;
  v_fee_club uuid;
  v_cents integer;
  v_now timestamptz := now();
  v_before jsonb;
  v_ref text := 'ADMIN-' || gen_random_uuid()::text;
  v_pairs jsonb;
BEGIN IF NOT public.chairman_financial_write_allowed(p_club_id) THEN RAISE EXCEPTION 'Chairman financial access is view-only' USING ERRCODE='42501'; END IF;
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Please sign in to confirm payment'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tournaments WHERE id = p_champ_id AND club_id = p_club_id) THEN
    RAISE EXCEPTION 'Tournament not found for this club';
  END IF;
  IF NOT (public.is_club_admin_or_permitted(auth.uid(), p_club_id, 'champs')
       OR public.is_club_admin_or_permitted(auth.uid(), p_club_id, 'fees')
       OR public.is_club_admin_or_permitted(auth.uid(), p_club_id, 'finance')) THEN
    RAISE EXCEPTION 'Only club tournament or finance administrators can confirm payment';
  END IF;
  SELECT * INTO v_reg FROM public.club_champs_registrations
   WHERE id = p_registration_id AND champ_id = p_champ_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Registration not found for this tournament'; END IF;
  IF lower(coalesce(v_reg.status,'')) IN ('cancelled','declined','withdrawn')
     OR v_reg.registration_status = 'declined' THEN
    RAISE EXCEPTION 'This registration is not available for payment updates';
  END IF;
  IF v_reg.fee_status IN ('paid','waived','not_required') THEN
    RETURN jsonb_build_object('ok', true, 'id', v_reg.id, 'already_settled', true);
  END IF;
  v_before := jsonb_build_object('status', v_reg.status, 'fee_status', v_reg.fee_status, 'fee_payment_id', v_reg.fee_payment_id);
  v_cents := public.champ_reg_own_due_cents(v_reg.id);
  IF coalesce(v_cents,0) <= 0 THEN RAISE EXCEPTION 'There is no entry fee to confirm'; END IF;
  IF v_reg.fee_payment_id IS NOT NULL THEN
    SELECT club_member_id INTO v_fee_member FROM public.club_member_fee_payments
     WHERE id = v_reg.fee_payment_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'The linked entry fee could not be found'; END IF;
    SELECT club_id INTO v_fee_club FROM public.club_members WHERE id = v_fee_member;
    IF v_fee_club IS DISTINCT FROM p_club_id THEN RAISE EXCEPTION 'The linked entry fee belongs to another club'; END IF;
    UPDATE public.club_member_fee_payments SET paid = true, paid_at = v_now
     WHERE id = v_reg.fee_payment_id AND NOT coalesce(paid,false);
  END IF;
  UPDATE public.club_champs_registrations
     SET status = 'paid', fee_paid_cents = v_cents, paid_at = v_now, payment_ref = v_ref
   WHERE id = v_reg.id AND champ_id = p_champ_id;
  -- Partner entries this player chose to pay for go on this player's account, same as card payments.
  v_pairs := public.champ_apply_paid_registration(v_reg.id, v_ref);
  INSERT INTO public.audit_events(club_id, actor_user_id, entity_type, entity_id, action, before_data, after_data)
  VALUES(p_club_id, auth.uid(), 'tournament_registration', v_reg.id, 'admin_confirm_paid', v_before,
         jsonb_build_object('status','paid','fee_paid_cents',v_cents,'fee_payment_id',v_reg.fee_payment_id,
                            'covered_partners', coalesce(v_pairs->'covered_partners','0'::jsonb)));
  RETURN jsonb_build_object('ok',true,'id',v_reg.id,'covered_partners', coalesce(v_pairs->'covered_partners','0'::jsonb));
END;
$function$;

DO $$ BEGIN
  EXECUTE replace(pg_get_functiondef('public._champ_record_partner_cover_fee'::regproc),
    'Partner entry fee paid by another player recorded under the partner',
    'Partner entry fee paid by another player recorded on the payer account');
END $$;