DO $$ DECLARE f record; d text; guard text; BEGIN
 FOR f IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('bar_member_tab_account_with_tip','bar_member_cart_account_with_tip','bar_qr_charge_guest_tab_member_session','bar_qr_charge_member_session') LOOP
  d:=pg_get_functiondef(f.oid);
  d:=regexp_replace(d,'(DECLARE|declare)', 'DECLARE chairman_previous_payment_flag text;');
  d:=regexp_replace(d,'(BEGIN|begin)', 'BEGIN chairman_previous_payment_flag:=coalesce(current_setting(''app.chairman_self_payment'',true),''''); PERFORM set_config(''app.chairman_self_payment'',''on'',true);');
  d:=regexp_replace(d,'(RETURN r\|\||RETURN r;|RETURN jsonb_build_object)', 'PERFORM set_config(''app.chairman_self_payment'',chairman_previous_payment_flag,true); \1','g');
  EXECUTE d;
 END LOOP;
 FOR f IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('champ_admin_confirm_paid','post_journal','bar_prepare_payroll_run_now','bar_set_staff_payday','bar_set_staff_pay','bar_set_normal_shift_opening','bar_review_shift_tips','set_member_credit_allowed','generate_member_renewal_invoices','bar_set_average_cost','bar_stock_take_finalise','bar_correct_staff_attendance','bar_confirm_payroll_run','admin_delete_journal_group','admin_reverse_journal_group','finance_decide_member_transaction','decide_recurring_transaction','champ_payment_claim_review','reset_club_finances') LOOP
  d:=pg_get_functiondef(f.oid);
  guard:=CASE f.proname
   WHEN 'champ_admin_confirm_paid' THEN 'p_club_id'
   WHEN 'post_journal' THEN 'p_club_id'
   WHEN 'reset_club_finances' THEN 'p_club_id'
   WHEN 'generate_member_renewal_invoices' THEN 'p_club_id'
   WHEN 'bar_set_average_cost' THEN '(SELECT club_id FROM public.bar_items WHERE id=_item)'
   WHEN 'bar_correct_staff_attendance' THEN '(SELECT club_id FROM public.bar_staff_attendance WHERE id=_id)'
   WHEN 'bar_confirm_payroll_run' THEN '(SELECT club_id FROM public.bar_payroll_runs WHERE id=_run_id)'
   WHEN 'bar_stock_take_finalise' THEN '(SELECT club_id FROM public.bar_stock_takes WHERE id=_take_id)'
   WHEN 'admin_delete_journal_group' THEN '(SELECT club_id FROM public.club_journal_entries WHERE journal_ref=_journal_ref LIMIT 1)'
   WHEN 'admin_reverse_journal_group' THEN '(SELECT club_id FROM public.club_journal_entries WHERE journal_ref=_journal_ref LIMIT 1)'
   WHEN 'finance_decide_member_transaction' THEN '(SELECT club_id FROM public.member_credit_transactions WHERE id=_tx_id)'
   WHEN 'decide_recurring_transaction' THEN '(SELECT club_id FROM public.club_recurring_transactions WHERE id=_id)'
   WHEN 'champ_payment_claim_review' THEN '(SELECT t.club_id FROM public.champ_payment_claims c JOIN public.tournaments t ON t.id=c.champ_id WHERE c.id=p_claim)'
   ELSE '_club_id' END;
  IF f.proname='set_member_credit_allowed' AND d NOT LIKE '%_club_id%' THEN CONTINUE; END IF;
  d:=regexp_replace(d,'(BEGIN|begin)', 'BEGIN IF NOT public.chairman_financial_write_allowed('||guard||') THEN RAISE EXCEPTION ''Chairman financial access is view-only'' USING ERRCODE=''42501''; END IF;');
  EXECUTE d;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.guard_chairman_registration_finance() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j jsonb:=to_jsonb(NEW); o jsonb:=to_jsonb(OLD); cid uuid;
BEGIN
 SELECT club_id INTO cid FROM public.tournaments WHERE id=NEW.champ_id;
 IF public.chairman_financial_write_allowed(cid) THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(j) e WHERE e.key=ANY(ARRAY['fee_paid_cents','fee_status','paid_at','payment_ref','fee_settled_via','fee_payment_id']) AND e.value IS DISTINCT FROM o->e.key) OR (NEW.status IS DISTINCT FROM OLD.status AND NEW.status::text IN ('paid','waived','pending_payment')) THEN RAISE EXCEPTION 'Chairman financial access is view-only' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_chairman_registration_finance() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER chairman_registration_finance BEFORE UPDATE ON public.club_champs_registrations FOR EACH ROW EXECUTE FUNCTION public.guard_chairman_registration_finance();
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['bar_staff_attendance','champ_payment_claims','club_permission_settings','club_billing_profiles'] LOOP
 EXECUTE format('CREATE TRIGGER chairman_finance_read_only BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_chairman_financial_write()',t);
 END LOOP;
END $$;